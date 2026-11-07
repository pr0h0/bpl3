import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";

function format(source: string): string {
  return new Formatter().format(new Parser(source, "m.bpl").parse(), source);
}

// Found by the generated-program fuzzer (BUG-480): a `match` whose subject
// spans several lines gained a blank line before its first arm on the second
// pass, so formatting was not idempotent.
test("a multi-line match subject does not add a blank line before arms", () => {
  const source = `frame main() ret int {
    local x: int = 1;
    local y: int = (match ((match (x) { 1 => 2, n if n > 3 => 4, _ => 5 })) { 2 => 1, _ => 0 });
    return y;
}
`;
  const once = format(source);
  expect(format(once)).toBe(once);
  expect(once).not.toMatch(/\) \{\n\n\s*2 =>/);
});

test("blank lines written between match arms are kept", () => {
  const source = `frame main() ret int {
    local x: int = 1;
    local y: int = match (x) {

        1 => 2,

        _ => 3,
    };
    return y;
}
`;
  expect(format(source)).toBe(source);
});
