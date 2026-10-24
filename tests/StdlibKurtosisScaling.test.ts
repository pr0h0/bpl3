import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases = [
  ["positive extreme", 'atof("1.7976931348623157e308")', "s,-s,-s,-s"],
  ["reversed extreme", 'atof("1.7976931348623157e308")', "-s,-s,-s,s"],
  ["negative extreme", 'atof("1.7976931348623157e308")', "-s,s,s,s"],
  ["subnormal spread", 'atof("5e-324")', "s,0.0,0.0,0.0"],
  ["large offset", 'atof("1e16")', "s,s,s,s+2.0"],
] as const;

for (const [name, magnitude, samples] of cases) {
  test(`kurtosis preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `kurtosis-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `
          import [Stats] from "std/stats.bpl";
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame main() ret int {
            local s: float = ${magnitude};
            local data: float[4] = [${samples}];
            local expected: float = -2.0 / 3.0;
            if (!(Math.abs(Stats.kurtosis(&data[0], 4) - expected) < 0.000000000001)) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("kurtosis retains ordinary, constant, empty and nonfinite behavior", () => {
  expectCorrectnessSuite([
    {
      name: "kurtosis-controls",
      validateLlvm: true,
      source: `
        import [Stats] from "std/stats.bpl";
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local ordinary: float[4] = [-1.0, -1.0, 1.0, 1.0];
          local constant: float[4] = [2.0, 2.0, 2.0, 2.0];
          local invalid: float[4] = [1.0, atof("inf"), 2.0, 3.0];
          local nan: float[4] = [1.0, atof("nan"), 2.0, 3.0];
          if (Stats.kurtosis(&ordinary[0], 4) != -2.0) { return 1; }
          if (ordinary[0] != -1.0 || ordinary[3] != 1.0) { return 2; }
          if (Stats.kurtosis(&constant[0], 4) != 0.0) { return 3; }
          if (Stats.kurtosis(&ordinary[0], 3) != 0.0 || Stats.kurtosis(&ordinary[0], 0) != 0.0) { return 4; }
          if (Stats.kurtosis(cast<*float>(nullptr), 4) != 0.0) { return 5; }
          if (!Math.isNan(Stats.kurtosis(&invalid[0], 4)) || !Math.isNan(Stats.kurtosis(&nan[0], 4))) { return 6; }
          return 0;
        }`,
    },
  ]);
}, 60000);
