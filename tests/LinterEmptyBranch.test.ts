import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function emptyBranches(body: string, withSource = true): string[] {
  const source = `frame main() ret int {\n    local x: int = 1;\n${body}\n    return x;\n}\n`;
  return new Linter()
    .lint(
      new Parser(source, "lint.bpl").parse(),
      withSource ? source : undefined,
    )
    .filter((diagnostic) => diagnostic.code === "L008")
    .map(
      (diagnostic) =>
        `${diagnostic.location!.startLine}: ${diagnostic.message}`,
    );
}

test("reports empty if and else bodies", () => {
  expect(
    emptyBranches(`    if (x > 0) {
    }
    if (x > 1) {
    } else {
        x = 2;
    }
    if (x > 2) {
        x = 3;
    } else {}
    if (x > 3) {
        x = 4;
    } else if (x > 4) {
    }`),
  ).toEqual([
    "3: This if has an empty body",
    "5: This if has an empty body",
    "11: This else has an empty body",
    "14: This if has an empty body",
  ]);
});

test("allows commented blocks and needs the source to see comments", () => {
  const body = `    if (x > 0) {
        # Nothing to do yet.
    } else {
        # Also nothing.
    }
    if (x > 1) {
        x = 2;
    }`;
  expect(emptyBranches(body)).toEqual([]);
  expect(emptyBranches(`    if (x > 0) {\n    }`, false)).toEqual([]);
});

test("handles CRLF line endings", () => {
  const source =
    "frame main() ret int {\r\n    local x: int = 1;\r\n    if (x > 0) {\r\n        # kept\r\n    }\r\n    if (x > 1) {\r\n    }\r\n    return x;\r\n}\r\n";
  expect(
    new Linter()
      .lint(new Parser(source, "lint.bpl").parse(), source)
      .filter((diagnostic) => diagnostic.code === "L008")
      .map((diagnostic) => diagnostic.location!.startLine),
  ).toEqual([6]);
});
