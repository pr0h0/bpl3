import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function selfAssignments(body: string): string[] {
  const source = `struct Box {\n    n: int,\n    items: int[2],\n}\n\nframe main() ret int {\n${body}\n    return 0;\n}\n`;
  return new Linter()
    .lint(new Parser(source, "lint.bpl").parse())
    .filter((diagnostic) => diagnostic.code === "L005")
    .map((diagnostic) => diagnostic.message);
}

test("reports a name, field or constant element assigned to itself", () => {
  expect(
    selfAssignments(`    local x: int = 1;
    local box: Box;
    x = x;
    box.n = box.n;
    box.items[0] = (box.items[0]);`),
  ).toEqual([
    "'x' is assigned to itself",
    "'box.n' is assigned to itself",
    "'box.items[0]' is assigned to itself",
  ]);
});

test("does not report different targets, computed indexes or compound operators", () => {
  expect(
    selfAssignments(`    local x: int = 1;
    local y: int = 2;
    local i: int = 0;
    local box: Box;
    x = y;
    box.items[i] = box.items[i];
    box.items[0] = box.items[1];
    x += x;`),
  ).toEqual([]);
});
