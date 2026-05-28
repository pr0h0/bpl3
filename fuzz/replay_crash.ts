import { writeFileSync } from "fs";
import {
  minimizeFuzzCrash,
  replayFuzzCrashArtifact,
  type FuzzStage,
} from "./compilerFuzz";

interface CliOptions {
  sourcePath?: string;
  metadataPath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  minimize: boolean;
  outPath?: string;
}

const STAGES = new Set<FuzzStage>([
  "lexer",
  "parser",
  "typecheck",
  "codegen",
]);

function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      throw new Error(`Missing option name in '${arg}'. Use --help for usage.`);
    }

    if (rawKey === "minimize") {
      flags.add(rawKey);
      continue;
    }

    const nextArg = argv[index + 1];
    const value =
      inlineValue ??
      (nextArg !== undefined && !nextArg.startsWith("--")
        ? argv[++index]!
        : undefined);

    if (value === undefined) {
      throw new Error(`--${rawKey} requires a value. Use --help for usage.`);
    }

    values.set(rawKey, value);
  }

  if (positionals.length > 1) {
    throw new Error("Expected at most one source path positional argument.");
  }

  return {
    sourcePath: values.get("source") ?? positionals[0],
    metadataPath: values.get("metadata"),
    expectedStage: parseStage(values.get("stage")),
    expectedMessageIncludes: values.get("message"),
    minimize: flags.has("minimize"),
    outPath: values.get("out"),
  };
}

function parseStage(value: string | undefined): FuzzStage | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!STAGES.has(value as FuzzStage)) {
    throw new Error(
      `--stage must be one of ${Array.from(STAGES).join(", ")}, got '${value}'.`,
    );
  }

  return value as FuzzStage;
}

function printHelp(): void {
  console.log(`Usage: bun fuzz/replay_crash.ts [source.bpl] [options]

Re-run a compiler fuzz crash artifact and optionally reduce it by deleting tokens
while preserving the crash signature.

Options:
  --source <path>    Path to a .bpl crash repro source
  --metadata <path>  Path to the generated .json crash metadata
  --stage <stage>    Require the crash stage: lexer, parser, typecheck, codegen
  --message <text>   Require the crash message to include this text
  --minimize         Write a token-minimized repro if replay still crashes
  --out <path>       Output path for --minimize (default: <source>.min.bpl)
  --help             Show this help text
`);
}

function defaultMinimizedPath(sourcePath: string): string {
  return sourcePath.endsWith(".bpl")
    ? sourcePath.slice(0, -".bpl".length) + ".min.bpl"
    : `${sourcePath}.min.bpl`;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const replay = replayFuzzCrashArtifact({
    sourcePath: options.sourcePath,
    metadataPath: options.metadataPath,
    expectedStage: options.expectedStage,
    expectedMessageIncludes: options.expectedMessageIncludes,
  });

  console.log(`Source: ${replay.sourcePath}`);
  if (replay.metadataPath) {
    console.log(`Metadata: ${replay.metadataPath}`);
  }
  console.log(`Crashed: ${replay.crashed ? "yes" : "no"}`);
  console.log(`Stage: ${replay.outcome.stage}`);
  if (replay.outcome.message) {
    console.log(`Message: ${replay.outcome.message.split("\n")[0]}`);
  }
  console.log(`Signature matches: ${replay.signatureMatches ? "yes" : "no"}`);

  if (!replay.crashed) {
    process.exit(2);
  }

  if (!replay.signatureMatches) {
    process.exit(3);
  }

  if (options.minimize) {
    const minimized = minimizeFuzzCrash({
      source: replay.source,
      filePath: replay.sourcePath,
      expectedStage: replay.expectedStage ?? replay.outcome.stage,
      expectedMessageIncludes: replay.expectedMessageIncludes,
    });
    const outPath = options.outPath ?? defaultMinimizedPath(replay.sourcePath);
    writeFileSync(outPath, minimized.minimizedSource);

    console.log(`Minimized source: ${outPath}`);
    console.log(
      `Tokens: ${minimized.originalTokenCount} -> ${minimized.minimizedTokenCount}`,
    );
    console.log(`Attempts: ${minimized.attempts}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
