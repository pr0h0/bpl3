import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function overwritten(body: string): number[] {
  const source = `frame next() ret int {\n    return 1;\n}\n\nframe main() ret int {\n${body}\n}\n`;
  return new Linter()
    .lint(new Parser(source, "lint.bpl").parse(), source)
    .filter((diagnostic) => diagnostic.code === "L009")
    .map((diagnostic) => diagnostic.location!.startLine);
}

test("reports a stored value replaced by the next statement", () => {
  expect(
    overwritten(`    local x: int = 1;
    x = 2;
    x = 3;
    local y: int = 0;
    y = x * 2;
    return y;`),
  ).toEqual([6, 7, 9]);
});

test("does not report reads, calls, compound assignments or separated stores", () => {
  expect(
    overwritten(`    local x: int = 1;
    x = x + 1;
    local y: int = next();
    y = 5;
    local z: int = 2;
    z += 3;
    local w: int = 1;
    if (z > 1) {
        w = 2;
    }
    w = 4;
    local v: int = 1;
    next();
    v = 2;
    return x + y + z + w + v;`),
  ).toEqual([]);
});
