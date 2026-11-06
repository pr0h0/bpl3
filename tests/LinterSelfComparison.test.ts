import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function selfComparisons(source: string): string[] {
  return new Linter()
    .lint(new Parser(source, "lint.bpl").parse())
    .filter((diagnostic) => diagnostic.code === "L006")
    .map((diagnostic) => diagnostic.message);
}

test("reports integers, bools, strings and pointers compared with themselves", () => {
  expect(
    selfComparisons(`frame check(n: int, flag: bool, p: *int) ret bool {
    local text: string = "a";
    return (n == n) || (flag != flag) || (p == p) || (text != text) || ((n) >= n) || (n < n);
}
`),
  ).toEqual([
    "'n == n' compares 'n' with itself and is always true",
    "'flag != flag' compares 'flag' with itself and is always false",
    "'p == p' compares 'p' with itself and is always true",
    "'text != text' compares 'text' with itself and is always false",
    "'n >= n' compares 'n' with itself and is always true",
    "'n < n' compares 'n' with itself and is always false",
  ]);
});

test("allows the NaN check on floating-point values but not < or >", () => {
  expect(
    selfComparisons(`frame isNan(x: float) ret bool {
    local y: f32 = 1.0;
    return (x != x) || (y == y) || (x <= x) || (x > x);
}
`),
  ).toEqual(["'x > x' compares 'x' with itself and is always false"]);
});

test("does not report unknown types, different names or redeclared names", () => {
  expect(
    selfComparisons(`struct Money {
    cents: int,
}

frame check<T>(m: Money, value: T, a: int, b: int) ret bool {
    return (m == m) || (value == value) || (a == b) || (m.cents == m.cents);
}

frame shadowed(n: int) ret bool {
    local f: Lambda<bool>(float) = |n: float| ret bool {
        return n != n;
    };
    return f(1.0) || (n == n);
}
`),
  ).toEqual([]);
});
