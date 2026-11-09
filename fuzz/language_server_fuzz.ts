/**
 * Runs the language services over generated programs and damaged copies of
 * them, at random positions. Two things must hold: no request throws (handlers
 * catch their own errors and log them, so logged errors count as well), and
 * renaming a symbol leaves the program compiling and printing the same output.
 *
 *   bun fuzz/language_server_fuzz.ts [from] [to] [renamesPerProgram] [outDir]
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";

import { ASTCompletionHandler } from "../vscode-ext/src/services/ASTCompletionHandler";
import { ASTDefinitionHandler } from "../vscode-ext/src/services/ASTDefinitionHandler";
import { ASTHoverHandler } from "../vscode-ext/src/services/ASTHoverHandler";
import { ASTRenameHandler } from "../vscode-ext/src/services/ASTRenameHandler";
import { ASTResolver } from "../vscode-ext/src/services/ASTResolver";
import { CodeLensProvider } from "../vscode-ext/src/services/CodeLensProvider";
import { DocumentHighlightProvider } from "../vscode-ext/src/services/DocumentHighlightProvider";
import { DocumentSymbolProvider } from "../vscode-ext/src/services/DocumentSymbolProvider";
import { FoldingRangeProvider } from "../vscode-ext/src/services/FoldingRangeProvider";
import { InlayHintProvider } from "../vscode-ext/src/services/InlayHintProvider";
import { SelectionRangeProvider } from "../vscode-ext/src/services/SelectionRangeProvider";
import { SemanticTokenProvider } from "../vscode-ext/src/services/SemanticTokenProvider";
import { SignatureHelpProvider } from "../vscode-ext/src/services/SignatureHelpProvider";
import { SymbolIndex } from "../vscode-ext/src/services/SymbolIndex";
import { createSeededRandom, runBplOraclePipeline } from "./compilerFuzz";
import { generateOracleProgram } from "./programGenerator";
import { mutateProgramTypes } from "./typeMutation";

const POSITIONS_PER_DOCUMENT = 25;
const NEW_NAME = "renamedByFuzzer";
const JUNK = ["(", "{", "}", ".", '"', "<", "frame ", "local x: ", "match ("];
// An extern's name is its link symbol, so renaming one rightly breaks the link;
// `main` is the entry point, and `_` marks a parameter as unused.
const NOT_RENAMED = /^(printf|snprintf|malloc|free|main|_.*)$/;

const [from, to, renames, outDir] = [
  Number(process.argv[2] ?? 0),
  Number(process.argv[3] ?? 100),
  Number(process.argv[4] ?? 3),
  process.argv[5] ?? join(tmpdir(), "bpl-ls-fuzz-failures"),
];
const workDir = mkdtempSync(join(tmpdir(), "bpl-ls-fuzz-"));
mkdirSync(outDir, { recursive: true });

const failures = new Map<string, number>();
let current = { seed: 0, source: "" };

function report(kind: string, detail = ""): void {
  const key = kind.replace(/\d+/g, "N").slice(0, 160);
  const count = failures.get(key) ?? 0;
  failures.set(key, count + 1);
  if (count > 0) return;
  const name = join(outDir, `failure-${failures.size}-${current.seed}.bpl`);
  writeFileSync(name, current.source);
  if (detail) writeFileSync(`${name}.txt`, detail);
  console.log(`${current.seed}: ${kind.slice(0, 240)}`);
}

function describeError(error: unknown): string {
  const lines = String((error as Error)?.stack ?? error).split("\n");
  const frame = lines.find((line) => line.includes("services/"));
  return `${lines[0]!.slice(0, 90)} @ ${frame?.replace(/^.*services\//, "").replace(/\).*$/, "") ?? "?"}`;
}

// Handlers log what they catch. A failed parse of damaged source is expected.
console.error = (...args: unknown[]) => {
  if (/Failed to parse/.test(String(args[0]))) return;
  const error = args.find((arg) => arg instanceof Error) ?? args.at(-1);
  report(`logged ${String(args[0]).slice(0, 40)} ${describeError(error)}`);
};

function attempt<T>(name: string, request: () => T): T | undefined {
  try {
    return request();
  } catch (error) {
    report(`${name} ${describeError(error)}`);
    return undefined;
  }
}

function checkDocument(label: string, source: string, rng: () => number): void {
  const int = (max: number) => Math.floor(rng() * (max + 1));
  current.source = source;
  const path = join(workDir, `${current.seed}-${label}.bpl`);
  writeFileSync(path, source);
  const uri = pathToFileURL(path).toString();
  const document = TextDocument.create(uri, "bpl", 1, source);
  const textDocument = { uri };
  const index = new SymbolIndex();
  attempt("index", () => index.indexFile(path, false));
  const resolver = new ASTResolver(index);
  const hover = new ASTHoverHandler(resolver, index);
  const definition = new ASTDefinitionHandler(resolver, index);
  const completion = new ASTCompletionHandler(resolver, index);
  const rename = new ASTRenameHandler(resolver, index);
  const selection = new SelectionRangeProvider(resolver);
  const highlight = new DocumentHighlightProvider(resolver);
  const signature = new SignatureHelpProvider(resolver, index);

  const lines = source.split("\n");
  const whole = {
    start: { line: 0, character: 0 },
    end: { line: lines.length, character: 0 },
  };
  attempt("symbols", () =>
    new DocumentSymbolProvider(resolver).handle({ textDocument }, document),
  );
  attempt("folding", () =>
    new FoldingRangeProvider(resolver).handle({ textDocument }, document),
  );
  attempt("tokens", () =>
    new SemanticTokenProvider(resolver).provideSemanticTokens(path, source),
  );
  attempt("inlay", () =>
    new InlayHintProvider(resolver, index).handle(
      { textDocument, range: whole },
      document,
    ),
  );
  attempt("lens", () =>
    new CodeLensProvider(resolver).provide({ textDocument }, document),
  );

  for (let round = 0; round < POSITIONS_PER_DOCUMENT; round++) {
    const line = int(Math.max(0, lines.length - 1));
    const position = { line, character: int(lines[line]!.length) };
    const params = { textDocument, position };
    attempt("hover", () => hover.handle(params, document));
    attempt("definition", () => definition.handle(params, document));
    attempt("completion", () => completion.handle(params, document));
    attempt("signature", () => signature.handle(params, document));
    attempt("highlight", () => highlight.handle(params, document));
    attempt("selection", () =>
      selection.handle({ textDocument, positions: [position] }, document),
    );
    attempt("prepareRename", () => rename.prepareRename(params, document));
  }

  if (label !== "original") return;
  let done = 0;
  for (let round = 0; round < 300 && done < renames; round++) {
    const line = int(lines.length - 1);
    const text = lines[line]!;
    if (text.startsWith("#")) continue;
    const names = [...text.matchAll(/[A-Za-z_]\w*/g)];
    if (names.length === 0) continue;
    const chosen = names[int(names.length - 1)]!;
    if (NOT_RENAMED.test(chosen[0])) continue;
    const params = {
      textDocument,
      position: { line, character: chosen.index },
    };
    if (!attempt("prepareRename", () => rename.prepareRename(params, document)))
      continue;
    done++;
    const edit = attempt("rename", () =>
      rename.rename({ ...params, newName: NEW_NAME }, document),
    );
    const edits = edit?.changes?.[uri];
    if (!edits || edits.length === 0) continue;
    const result = TextDocument.applyEdits(document, edits);
    const outcome = runBplOraclePipeline(result, "renamed.bpl");
    if (!outcome.ok) {
      const message = String(outcome.message ?? "");
      report(
        `rename of ${chosen[0]} broke the program: ${message.split("\n")[0]}`,
        `line ${line + 1}: ${text}\n${message.slice(0, 600)}\n\n${result}`,
      );
    }
  }
}

for (let seed = from; seed < to; seed++) {
  current = { seed, source: "" };
  const rng = createSeededRandom(seed);
  const int = (max: number) => Math.floor(rng() * (max + 1));
  const { source } = generateOracleProgram(rng);
  const at = int(source.length);
  checkDocument("original", source, rng);
  checkDocument("mutated", mutateProgramTypes(source, rng), rng);
  checkDocument("truncated", source.slice(0, at), rng);
  checkDocument(
    "gap",
    source.slice(0, at) + source.slice(at + 1 + int(29)),
    rng,
  );
  checkDocument(
    "junk",
    source.slice(0, at) + JUNK[int(JUNK.length - 1)]! + source.slice(at),
    rng,
  );
}

console.log(`checked seeds ${from}..${to}: ${failures.size} kinds of failure`);
for (const [kind, count] of failures) console.log(`${count}x ${kind}`);
process.exit(failures.size === 0 ? 0 : 1);
