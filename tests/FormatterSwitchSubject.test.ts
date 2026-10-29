import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";

// Found by the generated-program fuzzer: a switch subject spanning several
// lines (a `match`) gained a blank line before the first case on each pass.
test("a multi-line switch subject does not add a blank line before cases", () => {
  const source = `enum E { A, B }
frame main() ret int {
    local e: E = E.A;
    switch (match (e) {
        E.A => 0,
        E.B => 1,
    }) {
        case 0: {
            return 1;
        }
        default: {
            return 2;
        }
    }
    return 0;
}
`;
  const once = new Formatter().format(new Parser(source, "s.bpl").parse());
  const twice = new Formatter().format(new Parser(once, "s.bpl").parse(), once);
  expect(twice).toBe(once);
  expect(once).not.toMatch(/\) \{\n\n\s*case/);
});

test("a closing parenthesis on its own line is not a blank line", () => {
  const source = `frame main() ret int {
    local value: int = 0;
    switch (
        value
    ) {
        case 0: {
            return 1;
        }
        default: {
            return 2;
        }
    }
    return 0;
}
`;
  const formatted = new Formatter().format(
    new Parser(source, "s.bpl").parse(),
    source,
  );
  expect(formatted).toContain("    switch (value) {\n        case 0: {");
  expect(
    new Formatter().format(new Parser(formatted, "s.bpl").parse(), formatted),
  ).toBe(formatted);
});
