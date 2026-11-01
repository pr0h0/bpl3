import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function duplicateConditions(body: string): string[] {
  const source = `struct Box {\n    n: int,\n}\n\nframe next() ret int {\n    return 1;\n}\n\nframe main() ret int {\n    local x: int = 1;\n    local box: Box;\n${body}\n    return 0;\n}\n`;
  return new Linter()
    .lint(new Parser(source, "lint.bpl").parse())
    .filter((diagnostic) => diagnostic.code === "L007")
    .map(
      (diagnostic) =>
        `${diagnostic.location!.startLine}:${diagnostic.location!.startColumn}`,
    );
}

test("reports a condition repeated later in the same chain, once", () => {
  expect(
    duplicateConditions(`    if (x == 1) {
        x = 2;
    } else if (box.n > 0) {
        x = 3;
    } else if ((x == 1)) {
        x = 4;
    } else if (box.n > 0 && !(x < 2)) {
        x = 5;
    } else if (box.n > 0 && !(x < 2)) {
        x = 6;
    }`),
  ).toEqual(["16:16", "20:16"]);
});

test("does not report different conditions, calls, separate chains or else blocks", () => {
  expect(
    duplicateConditions(`    if (x == 1) {
        x = 2;
    } else if (x == 2) {
        x = 3;
    } else if (next() == 1) {
        x = 4;
    } else if (next() == 1) {
        x = 5;
    }
    if (x == 1) {
        x = 6;
    } else {
        if (x == 1) {
            x = 7;
        }
    }
    if (x == 1) {
        x = 8;
    }`),
  ).toEqual([]);
});
