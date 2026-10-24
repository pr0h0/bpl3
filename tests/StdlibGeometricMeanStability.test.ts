import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, value, count] of [
  ["largest finite", "1.7976931348623157e308", 70],
  ["larger repeated group", "1.7976931348623157e308", 128],
  ["smallest subnormal", "5e-324", 70],
  ["large ordinary", "1e308", 32],
  ["unit", "1", 70],
  ["small singleton", "1e-300", 1],
  ["positive infinity", "inf", 70],
] as const) {
  test(`geometric mean preserves identical ${name} samples`, () => {
    expectCorrectnessSuite([
      {
        name: `geometric-identical-${name.replaceAll(" ", "-")}`,
        source: `
        import [Stats] from "std/stats.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local values: float[${count}];
          local sample: float = atof("${value}");
          loop (local i: int = 0; i < ${count}; i = i + 1) { values[i] = sample; }
          if (Stats.geometricMean(&values[0], ${count}) != sample) { return 1; }
          return 0;
        }`,
      },
    ]);
  }, 60000);
}

test("geometric mean stays between distinct finite samples near the limit", () => {
  expectCorrectnessSuite([
    {
      name: "geometric-finite-bounds",
      source: `
      import [Stats] from "std/stats.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local values: float[70];
        local lower: float = atof("1.7976931348623155e308");
        local upper: float = atof("1.7976931348623157e308");
        loop (local i: int = 0; i < 70; i = i + 1) {
          if (i % 2 == 0) { values[i] = lower; } else { values[i] = upper; }
        }
        local result: float = Stats.geometricMean(&values[0], 70);
        if (!(result >= lower && result <= upper)) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("geometric mean retains ordinary and reciprocal-scale samples", () => {
  expectCorrectnessSuite([
    {
      name: "geometric-ordinary-and-wide",
      source: `
      import [Stats] from "std/stats.bpl";
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local ordinary: float[3] = [1.0, 4.0, 16.0];
        local wide: float[3] = [atof("1e300"), atof("1e-300"), 8.0];
        if (!(Math.abs(Stats.geometricMean(&ordinary[0], 3) / 4.0 - 1.0) < 0.000000000001)) { return 1; }
        if (!(Math.abs(Stats.geometricMean(&wide[0], 3) / 2.0 - 1.0) < 0.000000000001)) { return 2; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("geometric mean retains a mixed smallest-subnormal and largest-finite pair", () => {
  expectCorrectnessSuite([
    {
      name: "geometric-mixed-finite-extremes",
      source: `
      import [Stats] from "std/stats.bpl";
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local values: float[2] = [atof("5e-324"), atof("1.7976931348623157e308")];
        local result: float = Stats.geometricMean(&values[0], 2);
        if (!(Math.abs(result / 0.00000002980232238769531 - 1.0) < 0.000000000001)) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("geometric mean preserves nonpositive and nonfinite conventions", () => {
  expectCorrectnessSuite([
    {
      name: "geometric-domain-controls",
      source: `
      import [Stats] from "std/stats.bpl";
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local values: float[2] = [4.0, atof("inf")];
        if (Stats.geometricMean(&values[0], 2) != atof("inf")) { return 1; }
        values[0] = atof("nan");
        if (!Math.isNan(Stats.geometricMean(&values[0], 2))) { return 2; }
        values[1] = 0.0;
        if (Stats.geometricMean(&values[0], 2) != 0.0) { return 3; }
        values[0] = atof("inf");
        if (Stats.geometricMean(&values[0], 2) != 0.0) { return 4; }
        values[1] = -1.0;
        if (Stats.geometricMean(&values[0], 2) != 0.0) { return 5; }
        values[0] = atof("-inf");
        values[1] = 4.0;
        if (Stats.geometricMean(&values[0], 2) != 0.0) { return 6; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("geometric mean retains null and empty input conventions", () => {
  expectCorrectnessSuite([
    {
      name: "geometric-empty-controls",
      source: `
      import [Stats] from "std/stats.bpl";
      frame main() ret int {
        local values: float[1] = [4.0];
        if (Stats.geometricMean(cast<*float>(nullptr), 1) != 0.0) { return 1; }
        if (Stats.geometricMean(&values[0], 0) != 0.0) { return 2; }
        if (Stats.geometricMean(&values[0], -1) != 0.0) { return 3; }
        return 0;
      }`,
    },
  ]);
}, 60000);
