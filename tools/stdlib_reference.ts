import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import type * as AST from "../compiler/common/AST";
import { Parser } from "../compiler/frontend/Parser";

const repositoryRoot = resolve(import.meta.dir, "..");
export const STDLIB_REFERENCE_PATH = "docs/stdlib-reference.md";

function sourceText(source: string, node: AST.ASTNode): string {
  const location = node.location;
  const lines = source.split(/\r?\n/);
  const selected = lines.slice(location.startLine - 1, location.endLine);
  selected[selected.length - 1] = selected
    .at(-1)!
    .slice(0, location.endColumn - 1);
  selected[0] = selected[0]!.slice(location.startColumn - 1);
  return selected.join("\n").trim();
}

function signature(source: string, node: AST.ASTNode): string {
  const text = sourceText(source, node);
  return (
    node.kind === "FunctionDecl" ? text.slice(0, text.indexOf("{")) : text
  )
    .replace(/\s+/g, " ")
    .replace(/[,;]$/, "")
    .trim();
}

export function renderModuleReference(source: string, file: string): string {
  const ast = new Parser(source, file).parse(false);
  if (ast.errors?.length) throw ast.errors[0];
  const exports = ast.statements.filter((node) => node.kind === "Export");
  const names = new Set(
    exports.flatMap((node) => node.items.map((item) => item.name)),
  );
  const module = file.replace(/^lib\//, "std/");
  const output = [
    `## ${module}`,
    "",
    `[Source](../${file})`,
    "",
    "Exports:",
    "",
    "```bpl",
  ];
  output.push(
    ...[...new Set(exports.map((node) => sourceText(source, node)))],
    "```",
    "",
  );
  for (const node of ast.statements) {
    if (
      !("name" in node) ||
      typeof node.name !== "string" ||
      !names.has(node.name)
    )
      continue;
    if (
      node.kind === "StructDecl" ||
      node.kind === "EnumDecl" ||
      node.kind === "SpecDecl"
    ) {
      output.push(`### ${node.name}`, "", "```bpl");
      const text = sourceText(source, node);
      output.push(text.slice(0, text.indexOf("{")).replace(/\s+/g, " ").trim());
      const members =
        node.kind === "StructDecl"
          ? node.members
          : node.kind === "SpecDecl"
            ? node.methods
            : [...node.variants, ...node.methods];
      output.push(
        ...members.map((member) => signature(source, member)),
        "```",
        "",
      );
    } else if (
      ["FunctionDecl", "Extern", "TypeAlias", "VariableDecl"].includes(
        node.kind,
      )
    ) {
      output.push("```bpl", signature(source, node), "```", "");
    }
  }
  return output.join("\n");
}

export function generateStdlibReference(root = repositoryRoot): string {
  const files: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".bpl")) files.push(path);
    }
  }
  walk(join(root, "lib"));
  files.sort();
  const paths = files.map((file) => relative(root, file).replaceAll("\\", "/"));
  return [
    "# Standard Library Declaration Reference",
    "",
    "Generated from parsed library declarations with `bun run docs:stdlib`. Do not edit by hand.",
    "",
    `This index covers all ${files.length} BPL modules under \`lib/\`, including memory and low-level modules.`,
    "It lists explicit exports and declarations defined in each source file. Re-exported symbols",
    "are listed under exports; their definitions are in the originating modules. Inherited members",
    "are not repeated. An exported type's declared members include implementation helpers and fields;",
    "their presence does not make direct mutation or internal helper calls a supported usage pattern.",
    "",
    "These are declaration excerpts, not standalone programs. Receiver parameters (`this`) are shown",
    "explicitly; callers normally use method syntax. Platform support, ownership, bounds, and failure",
    "behavior are described in the [standard-library guide](48-stdlib-api.md) and linked chapters.",
    "A declaration here proves that the API is present in source, not that every instantiation or",
    "platform has been validated. C/POSIX extern declarations retain their native ABI requirements.",
    "",
    "## Module index",
    "",
    ...paths.map((file) => `- [${file.replace(/^lib\//, "std/")}](../${file})`),
    "",
    ...files.map((file, index) =>
      renderModuleReference(readFileSync(file, "utf8"), paths[index]!),
    ),
  ].join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check") || args.length > 1) {
    console.error("Usage: bun tools/stdlib_reference.ts [--check]");
    process.exit(2);
  }
  const generated = generateStdlibReference();
  const path = join(repositoryRoot, STDLIB_REFERENCE_PATH);
  if (args.includes("--check")) {
    if (readFileSync(path, "utf8") !== generated) {
      console.error(
        "Standard library reference is stale. Run bun run docs:stdlib.",
      );
      process.exit(1);
    }
  } else writeFileSync(path, generated);
}
