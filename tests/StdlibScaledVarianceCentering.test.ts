import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
for (const [method, low, high] of [
  ["stddev", "1e308", "1.0000000000000002e308"],
  ["stddev", "1e-200", "1.0000000000000004e-200"],
  ["sampleStddev", "1e308", "1.0000000000000002e308"],
  ["sampleStddev", "1e-200", "1.0000000000000004e-200"],
] as const) {
  test(`${method} preserves a close spread at ${low}`, () => {
    expectCorrectnessSuite([
      {
        name: `scaled-variance-centered-${method}-${low}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
   frame main()ret int{local low:float=atof("${low}");local high:float=atof("${high}");local gap:float=high-low;if(!(gap>0.0))return 1;local expected:float=gap/${method === "stddev" ? "2.0" : "Math.sqrt(2.0)"};local values:float[2]=[low,high];if(!(Math.abs(Stats.${method}(&values[0],2)/expected-1.0)<0.000000000001))return 2;values[0]=high;values[1]=low;if(!(Math.abs(Stats.${method}(&values[0],2)/expected-1.0)<0.000000000001))return 3;return 0;}`,
      },
    ]);
  }, 60000);
}
