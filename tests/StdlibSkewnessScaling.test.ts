import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases = [
  ["positive extreme", 'atof("1.7976931348623157e308")', "s,-s,-s", "1.0"],
  ["reversed extreme", 'atof("1.7976931348623157e308")', "-s,-s,s", "1.0"],
  ["negative extreme", 'atof("1.7976931348623157e308")', "-s,s,s", "-1.0"],
  ["subnormal spread", 'atof("5e-324")', "s,0.0,0.0", "1.0"],
  ["large offset", 'atof("1e16")', "s,s,s+2.0", "1.0"],
] as const;

for (const [name, magnitude, samples, sign] of cases) {
  test(`skewness preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `skewness-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `
          import [Stats] from "std/stats.bpl";
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame main() ret int {
            local s: float = ${magnitude};
            local data: float[3] = [${samples}];
            local expected: float = ${sign} / Math.sqrt(2.0);
            if (!(Math.abs(Stats.skewness(&data[0], 3) - expected) < 0.000000000001)) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("skewness retains ordinary, constant, empty and nonfinite behavior", () => {
  expectCorrectnessSuite([
    {
      name: "skewness-controls",
      validateLlvm: true,
      source: `
        import [Stats] from "std/stats.bpl";
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local ordinary: float[3] = [-1.0, 0.0, 1.0];
          local constant: float[3] = [2.0, 2.0, 2.0];
          local invalid: float[3] = [1.0, atof("inf"), 2.0];
          local nan: float[3] = [1.0, atof("nan"), 2.0];
          if (Stats.skewness(&ordinary[0], 3) != 0.0) { return 1; }
          if (ordinary[0] != -1.0 || ordinary[2] != 1.0) { return 2; }
          if (Stats.skewness(&constant[0], 3) != 0.0) { return 3; }
          if (Stats.skewness(&ordinary[0], 2) != 0.0 || Stats.skewness(&ordinary[0], 0) != 0.0) { return 4; }
          if (Stats.skewness(cast<*float>(nullptr), 3) != 0.0) { return 5; }
          if (!Math.isNan(Stats.skewness(&invalid[0], 3)) || !Math.isNan(Stats.skewness(&nan[0], 3))) { return 6; }
          return 0;
        }`,
    },
  ]);
}, 60000);
