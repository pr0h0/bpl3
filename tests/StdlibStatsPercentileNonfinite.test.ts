import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("percentile propagates NaN before computing an array index", () => {
  expectCorrectnessSuite([{
    name: "stats-percentile-nonfinite",
    validateLlvm: true,
    source: `
      import [Stats] from "std/stats.bpl";
      frame main() ret int {
        local data: float[3] = [3.0, 1.0, 2.0];
        local nan: float = 0.0 / 0.0;
        local result: float = Stats.percentile(&data[0], 3, nan);
        if (result == result) { return 1; }
        local infinity: float = 1.0 / 0.0;
        if (Stats.percentile(&data[0], 3, infinity) != 3.0) { return 3; }
        if (Stats.percentile(&data[0], 3, -infinity) != 1.0) { return 4; }
        if (Stats.percentile(&data[0], 3, 50.0) != 2.0) { return 5; }
        if (Stats.percentile(&data[0], 3, 25.0) != 1.5) { return 6; }
        local single: float = 7.0;
        local singletonResult: float = Stats.percentile(&single, 1, nan);
        if (singletonResult == singletonResult) { return 7; }
        if (Stats.percentile(cast<*float>(nullptr), 0, nan) != 0.0) { return 8; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
