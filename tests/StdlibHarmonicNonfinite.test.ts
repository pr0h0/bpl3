import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("harmonic mean handles positive infinity without producing spurious NaNs", () => {
  expectCorrectnessSuite([{
    name: "harmonic-nonfinite-values",
    validateLlvm: true,
    source: `
      import [Stats] from "std/stats.bpl";
      import [Math] from "std/math.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local inf: float = atof("inf");
        local nan: float = atof("nan");
        local values: float[2] = [inf, inf];
        if (Stats.harmonicMean(&values[0], 2) != inf) { return 1; }
        if (Stats.harmonicMean(&values[0], 1) != inf) { return 2; }
        values[0] = 2.0;
        if (Stats.harmonicMean(&values[0], 2) != 4.0) { return 3; }
        values[0] = inf; values[1] = 2.0;
        if (Stats.harmonicMean(&values[0], 2) != 4.0) { return 4; }
        values[1] = nan;
        if (!Math.isNan(Stats.harmonicMean(&values[0], 2))) { return 5; }
        values[0] = nan; values[1] = inf;
        if (!Math.isNan(Stats.harmonicMean(&values[0], 2))) { return 6; }
        values[0] = 0.0; values[1] = 2.0;
        if (Stats.harmonicMean(&values[0], 2) != 0.0) { return 7; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
