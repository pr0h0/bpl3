import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function constantConditions(body: string): string[] {
  const source = `frame main() ret int {\n    local x: int = 1;\n${body}\n    return x;\n}\n`;
  const program = new Parser(source, "lint.bpl").parse();
  return new Linter()
    .lint(program)
    .filter((diagnostic) => diagnostic.code === "L004")
    .map(
      (diagnostic) =>
        `${diagnostic.location?.startLine}: ${diagnostic.message}`,
    );
}

test("reports if, ternary and loop conditions that are boolean literals", () => {
  expect(
    constantConditions(`    if (true) {
        x = 2;
    }
    if ((false)) {
        x = 3;
    } else {
        x = 4;
    }
    loop (false) {
        x = 5;
    }
    loop (local i: int = 0; false; i = i + 1) {
        x = i;
    }
    x = true ? 6 : 7;`),
  ).toEqual([
    "3: This if condition is always true",
    "6: This if condition is always false",
    "11: This loop condition is always false, so the body never runs",
    "14: This loop condition is always false, so the body never runs",
    "17: This ternary condition is always true",
  ]);
});

test("does not report real conditions or the loop (true) idiom", () => {
  expect(
    constantConditions(`    if (x > 0) {
        x = 2;
    }
    loop (true) {
        break;
    }
    loop {
        break;
    }
    loop (x < 10) {
        x = x + 1;
    }
    x = (x == 1) ? 6 : 7;`),
  ).toEqual([]);
});
