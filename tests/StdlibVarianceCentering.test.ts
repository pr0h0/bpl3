import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
for (const [method, reverse] of [
  ["variance", false],
  ["variance", true],
  ["sampleVariance", false],
  ["sampleVariance", true],
] as const) {
  test(`${method} preserves a small spread at a large offset${reverse ? " in reverse order" : ""}`, () => {
    expectCorrectnessSuite([
      {
        name: `variance-centered-${method}-${reverse}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";extern atof(value:string)ret float;
   frame main()ret int{local base:float=atof("1e16");local values:float[2]=[${reverse ? "base+2.0,base" : "base,base+2.0"}];if(Stats.${method}(&values[0],2)!=${method === "variance" ? "1.0" : "2.0"})return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
