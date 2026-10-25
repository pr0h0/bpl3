import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [negative, first] of [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
] as const) {
  test(`mixed covariance retains ${negative ? "negative" : "positive"} contributions with tiny sample ${first ? "first" : "last"}`, () => {
    expectCorrectnessSuite([
      {
        name: `covariance-mixed-${negative}-${first}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
   frame main()ret int{local s:float=atof("1e154");local t:float=${negative ? "-" : ""}atof("1e-154");local x:float[5]=[${first ? "s,s,-s,s,-s" : "s,-s,s,-s,s"}];local y:float[5]=[${first ? "t,s,-s,-s,s" : "s,-s,-s,s,t"}];local expected:float=${negative ? "-0.16" : "0.16"};if(!(Math.abs(Stats.covariance(&x[0],&y[0],5)/expected-1.0)<0.000000000001))return 1;if(!(Math.abs(Stats.covariance(&y[0],&x[0],5)/expected-1.0)<0.000000000001))return 2;local coefficient:float=expected/s/s/Math.sqrt(0.96)/Math.sqrt(0.8);if(!(Math.abs(Stats.correlation(&x[0],&y[0],5)/coefficient-1.0)<0.000000000001))return 3;return 0;}`,
      },
    ]);
  }, 60000);
}
