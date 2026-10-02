import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("integer statistics range rejects an unrepresentable difference", () => {
  expectCorrectnessSuite([{
    name: "stats-range-result-boundaries",
    validateLlvm: true,
    source: `
      import [Stats] from "std/stats.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local values: int[2] = [cast<int>(-2147483648), 2147483647];
        local caught: bool = false;
        try { Stats.range(&values[0], 2); }
        catch (error: string) { caught = strcmp(error, "Stats.range result exceeds int") == 0; }
        if (!caught) { return 1; }
        values[0] = -1; values[1] = 2147483647;
        caught = false;
        try { Stats.range(&values[0], 2); }
        catch (error: string) { caught = strcmp(error, "Stats.range result exceeds int") == 0; }
        if (!caught) { return 2; }
        values[0] = 0;
        if (Stats.range(&values[0], 2) != 2147483647) { return 3; }
        values[0] = -7; values[1] = 9;
        if (Stats.range(&values[0], 2) != 16) { return 4; }
        if (Stats.range(&values[0], 1) != 0) { return 5; }
        if (Stats.range(cast<*int>(nullptr), 2) != 0) { return 6; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
