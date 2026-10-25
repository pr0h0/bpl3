import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const magnitude of ["1e16", "1e308"] as const) {
  for (const negative of [false, true]) {
    for (const first of [false, true]) {
      test(`mean preserves ${negative ? "negative" : "positive"} cancellation residual at ${magnitude}, small term ${first ? "first" : "middle"}`, () => {
        expectCorrectnessSuite([
          {
            name: `mean-cancellation-${magnitude}-${negative}-${first}`,
            validateLlvm: true,
            source: `
              import [Stats] from "std/stats.bpl";
              import [Math] from "std/math.bpl";
              extern atof(value: string) ret float;
              frame main() ret int {
                local s: float = atof("${magnitude}");
                local small: float = ${negative ? "-1.0" : "1.0"};
                local data: float[3] = [${first ? "small, s, -s" : "s, small, -s"}];
                local expected: float = small / 3.0;
                if (!(Math.abs(Stats.mean(&data[0], 3) / expected - 1.0) < 0.000000000001)) { return 1; }
                if (data[0] != ${first ? "small" : "s"} || data[2] != -s) { return 2; }
                return 0;
              }`,
          },
        ]);
      }, 60000);
    }
  }
}

test("mean preserves finite-limit, subnormal and nonfinite controls", () => {
  expectCorrectnessSuite([
    {
      name: "mean-cancellation-controls",
      validateLlvm: true,
      source: `
        import [Stats] from "std/stats.bpl";
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local largest: float = atof("1.7976931348623157e308");
          local tiny: float = atof("5e-324");
          local constant: float[3] = [largest, largest, largest];
          local negative: float[3] = [-largest, -largest, -largest];
          local thirds: float[3] = [largest / 3.0, largest / 3.0, largest / 3.0];
          local subnormal: float[2] = [tiny, tiny];
          local small: float = atof("1e-307");
          local mixed: float[3] = [largest, small, -largest];
          local repeated: float[11];
          loop (local i: int = 0; i < 11; i = i + 1) { repeated[i] = largest; }
          local ordinary: float[4] = [-3.0, -1.0, 1.0, 3.0];
          local inf: float = atof("inf");
          local nan: float = atof("nan");
          local positiveInf: float[2] = [inf, 1.0];
          local negativeInf: float[2] = [-inf, 1.0];
          local oppositeInf: float[2] = [inf, -inf];
          local invalid: float[2] = [1.0, nan];
          if (Stats.mean(&constant[0], 3) != largest) { return 1; }
          if (Stats.mean(&negative[0], 3) != -largest) { return 2; }
          if (Stats.mean(&thirds[0], 3) != largest / 3.0) { return 3; }
          if (Stats.mean(&subnormal[0], 2) != tiny) { return 4; }
          if (Stats.mean(&ordinary[0], 4) != 0.0) { return 5; }
          if (Stats.mean(&ordinary[0], 0) != 0.0 || Stats.mean(&ordinary[0], -1) != 0.0) { return 6; }
          if (Stats.mean(cast<*float>(nullptr), 1) != 0.0) { return 7; }
          if (Stats.mean(&positiveInf[0], 2) != inf || Stats.mean(&negativeInf[0], 2) != -inf) { return 8; }
          if (!Math.isNan(Stats.mean(&oppositeInf[0], 2)) || !Math.isNan(Stats.mean(&invalid[0], 2))) { return 9; }
          if (!(Math.abs(Stats.mean(&mixed[0], 3) / (small / 3.0) - 1.0) < 0.000000000001)) { return 10; }
          if (Stats.mean(&repeated[0], 11) != largest) { return 11; }
          return 0;
        }`,
    },
  ]);
}, 60000);
