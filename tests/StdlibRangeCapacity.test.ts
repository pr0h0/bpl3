import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Range rejects lengths that cannot fit its int result", () => {
  expectCorrectnessSuite([{
    name: "range-length-capacity",
    validateLlvm: true,
    source: `
      import [Range] from "std/range.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame rejected(r: Range) ret bool {
        try { r.len(); return false; }
        catch (error: string) { return strcmp(error, "Range length exceeds int") == 0; }
      }
      frame main() ret int {
        local max: Range = Range.new(0, 2147483647, 1);
        if (max.len() != 2147483647) { return 1; }
        local rev: Range = max.reverse();
        if (rev.len() != 2147483647) { return 2; }
        if (rev.get(0) != 2147483646) { return 3; }
        if (!rejected(Range.new(-1, 2147483647, 1))) { return 4; }
        if (!rejected(Range.new(2147483647, -1, -1))) { return 5; }
        local full: Range = Range.betweenInclusive(-2147483648, 2147483647);
        if (!rejected(full)) { return 6; }
        try { full.reverse(); return 7; }
        catch (error: string) { if (strcmp(error, "Range length exceeds int") != 0) { return 8; } }
        local empty: Range = Range.new(0, 10, 0);
        if (empty.len() != 0) { return 9; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
