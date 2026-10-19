import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

const root = path.resolve(import.meta.dir, "..");
// These already fail parsing; they are exclusions, not formatter passes.
const knownParseFailures = new Set([
  "examples/bug_hunt_session/test_enum_edge.bpl",
  "examples/bug_hunt_session/test_parser_edge.bpl",
  "examples/bug_hunt_session/test_double_comma.bpl",
  "examples/bug_hunt_session/test_lambda.bpl",
  "examples/module_resolution/test_invalid_type_export.bpl",
  "examples/module_resolution/test_invalid_type_import.bpl",
  "examples/module_resolution/test_invalid_export.bpl",
]);

function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith(".") ||
      ["node_modules", "bpl_modules", "build", "dist"].includes(entry.name)
    )
      return [];
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.isFile() && /\.(bpl|x)$/.test(entry.name) ? [full] : [];
  });
}

test("repository source corpus preserves meaning, comments and formatting stability", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const file of ["examples", "lib", "packages"].flatMap((directory) =>
    sources(path.join(root, directory)),
  )) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    if (knownParseFailures.has(relative)) {
      let rejected = false;
      try {
        new Parser(source, file).parse();
      } catch {
        rejected = true;
      }
      if (!rejected)
        failures.push(`${relative}: remove resolved baseline parse exclusion`);
      continue;
    }
    try {
      const ast = new Parser(source, file).parse();
      const formatter = new Formatter();
      const formatted = formatter.format(ast);
      const parsed = new Parser(formatted, file).parse();
      if (
        JSON.stringify(formatterSemantics(parsed)) !==
        JSON.stringify(formatterSemantics(ast))
      )
        failures.push(`${relative}: AST meaning changed`);
      const comments = (program: typeof ast) =>
        (program.comments ?? []).map((comment) =>
          comment.lexeme
            .split(/\r\n?|\n/)
            .map((line) => line.trim())
            .join("\n"),
        );
      if (JSON.stringify(comments(ast)) !== JSON.stringify(comments(parsed)))
        failures.push(`${relative}: comment text/order changed`);
      if (formatter.format(parsed) !== formatted)
        failures.push(`${relative}: second formatting pass changed output`);
      checked++;
    } catch (error) {
      failures.push(`${relative}: ${String(error)}`);
    }
  }
  expect(checked).toBeGreaterThan(600);
  expect(failures).toEqual([]);
}, 120000);
