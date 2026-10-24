import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const invalid = [
  ["ascending negative", "Range.new(1, 5, 2)", -1, false],
  ["ascending end", "Range.new(1, 5, 2)", 2, false],
  ["ascending beyond", "Range.new(1, 5, 2)", 10, false],
  ["descending negative", "Range.new(5, 1, -2)", -1, false],
  ["descending end", "Range.new(5, 1, -2)", 2, false],
  ["wrong ascending direction", "Range.new(5, 1, 1)", 0, false],
  ["wrong descending direction", "Range.new(1, 5, -1)", 0, false],
  ["empty", "Range.new(1, 1, 1)", 0, false],
  ["zero step", "Range.new(0, 10, 0)", 0, false],
  ["indexing operator", "Range.new(1, 5, 2)", 2, true],
  [
    "inclusive maximum",
    "Range.betweenInclusive(2147483646, 2147483647)",
    2,
    false,
  ],
  [
    "inclusive minimum",
    "Range.betweenInclusive(-2147483648, -2147483647)",
    2,
    false,
  ],
] as const;

for (const [name, expression, index, bracket] of invalid) {
  test(`Range rejects ${name} index`, () => {
    expectCorrectnessSuite([
      {
        name: `range-index-${name.replaceAll(" ", "-")}`,
        source: `
        import [Range] from "std/range.bpl";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local range: Range = ${expression};
          try {
            ${bracket ? `range[${index}]` : `range.get(${index})`};
            return 1;
          } catch (error: string) {
            if (strcmp(error, "Range index out of bounds") != 0) { return 2; }
          }
          return 0;
        }`,
      },
    ]);
  }, 60000);
}

test("Range indexing retains valid ascending, descending, reverse and wide indices", () => {
  expectCorrectnessSuite([
    {
      name: "range-valid-index-controls",
      source: `
      import [Range] from "std/range.bpl";
      frame main() ret int {
        local ascending: Range = Range.new(1, 5, 2);
        local descending: Range = Range.new(5, 1, -2);
        local reversed: Range = ascending.reverse();
        if (ascending.get(0) != 1 || ascending[1] != 3) { return 1; }
        if (descending[0] != 5 || descending.get(1) != 3) { return 2; }
        if (reversed[0] != 3 || reversed[1] != 1) { return 3; }
        local wide: Range = Range.betweenInclusive(-2147483648, 2147483647);
        if (wide.get(0) != -2147483648 || wide[2147483647] != -1) { return 4; }
        local top: Range = Range.betweenInclusive(2147483646, 2147483647);
        if (top[1] != 2147483647) { return 5; }
        local largeStep: Range = Range.new(2147483647, -2147483648, -2147483648);
        local reverseStep: Range = largeStep.reverse();
        if (largeStep[1] != -1 || reverseStep[1] != 2147483647) { return 6; }
        return 0;
      }`,
    },
  ]);
}, 60000);
