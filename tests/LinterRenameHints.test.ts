import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function hints(source: string): string[] {
  const program = new Parser(source, "lint.bpl").parse();
  return new Linter().lint(program).map((diagnostic) => diagnostic.hint ?? "");
}

test("naming hints suggest a converted name only when it is an identifier", () => {
  expect(
    hints("struct my_thing { x: int, }\nframe main() ret int { return 0; }\n"),
  ).toEqual(["Rename it to 'MyThing'."]);
  // `_frame` would become the keyword `frame`, and `_123` is not an identifier.
  expect(
    hints(
      "frame _frame() {}\nframe _123() {}\nframe main() ret int { return 0; }\n",
    ),
  ).toEqual([
    "Rename it to camelCase, e.g. 'doWork'.",
    "Rename it to camelCase, e.g. 'doWork'.",
  ]);
});
