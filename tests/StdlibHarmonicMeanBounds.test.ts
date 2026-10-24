import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [count, lowerFirst] of [
  [7, false],
  [7, true],
  [70, false],
  [128, false],
] as const) {
  test(`harmonic mean retains finite bounds for ${count} samples, lower ${lowerFirst ? "first" : "last"}`, () => {
    expectCorrectnessSuite([
      {
        name: `harmonic-bounds-${count}-${lowerFirst}`,
        source: `
        import [Stats] from "std/stats.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local values: float[${count}];
          local lower: float = atof("1.7976931348623155e308");
          local upper: float = atof("1.7976931348623157e308");
          loop(local i: int = 0; i < ${count}; i = i + 1) { values[i] = upper; }
          values[${lowerFirst ? 0 : count - 1}] = lower;
          local result: float = Stats.harmonicMean(&values[0], ${count});
          if (!(result >= lower && result <= upper)) { return 1; }
          return 0;
        }`,
      },
    ]);
  }, 60000);
}

test("harmonic mean preserves identical values, mixed scales and domain conventions", () => {
  expectCorrectnessSuite([
    {
      name: "harmonic-bounds-controls",
      source: `
      import [Stats] from "std/stats.bpl";
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local values: float[2] = [atof("1.7976931348623157e308"), atof("1.7976931348623157e308")];
        if (Stats.harmonicMean(&values[0], 2) != values[0]) { return 1; }
        values[0] = atof("5e-324"); values[1] = values[0];
        if (Stats.harmonicMean(&values[0], 2) != values[0]) { return 2; }
        values[0] = atof("1e-300"); values[1] = atof("1e300");
        if (!(Math.abs(Stats.harmonicMean(&values[0], 2) / atof("2e-300") - 1.0) < 0.000000000001)) { return 3; }
        values[0] = 4.0; values[1] = atof("inf");
        if (Stats.harmonicMean(&values[0], 2) != 8.0) { return 4; }
        values[0] = atof("inf");
        if (Stats.harmonicMean(&values[0], 2) != atof("inf")) { return 5; }
        values[0] = atof("nan"); values[1] = 0.0;
        if (!Math.isNan(Stats.harmonicMean(&values[0], 2))) { return 6; }
        values[0] = 0.0; values[1] = atof("nan");
        if (Stats.harmonicMean(&values[0], 2) != 0.0) { return 7; }
        values[0] = -1.0; values[1] = 4.0;
        if (Stats.harmonicMean(&values[0], 2) != 0.0) { return 8; }
        if (Stats.harmonicMean(cast<*float>(nullptr), 1) != 0.0) { return 9; }
        if (Stats.harmonicMean(&values[0], 0) != 0.0) { return 10; }
        return 0;
      }`,
    },
  ]);
}, 60000);
