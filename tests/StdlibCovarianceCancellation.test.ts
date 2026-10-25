import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
for (const magnitude of ["1e154", "1e308"] as const) {
  test(`covariance preserves exact cancellation at ${magnitude}`, () => {
    expectCorrectnessSuite([
      {
        name: `covariance-cancellation-${magnitude}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";extern atof(value:string)ret float;frame main()ret int{local v:float=atof("${magnitude}");local x:float[6]=[-v,-v,-v,v,v,v];local y:float[6]=[-v,0.0,v,-v,0.0,v];if(Stats.covariance(&x[0],&y[0],6)!=0.0)return 1;if(Stats.covariance(&y[0],&x[0],6)!=0.0)return 2;if(Stats.correlation(&x[0],&y[0],6)!=0.0)return 3;return 0;}`,
      },
    ]);
  }, 60000);
}
