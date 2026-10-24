import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [kind, magnitude, setup, expression] of [
  [
    "population",
    "1e308",
    'local x:float=atof("1e308");local values:float[2]=[x,-x];',
    "Stats.stddev(&values[0],2)",
  ],
  [
    "population",
    "1e-200",
    'local x:float=atof("1e-200");local values:float[2]=[x,-x];',
    "Stats.stddev(&values[0],2)",
  ],
  [
    "sample",
    "1e308",
    'local x:float=atof("1e308");local values:float[3]=[x,-x,0.0];',
    "Stats.sampleStddev(&values[0],3)",
  ],
  [
    "sample",
    "1e-200",
    'local x:float=atof("1e-200");local values:float[3]=[x,-x,0.0];',
    "Stats.sampleStddev(&values[0],3)",
  ],
] as const) {
  test(`${kind} standard deviation preserves finite ${magnitude} results`, () => {
    expectCorrectnessSuite([
      {
        name: `stddev-scaling-${kind}-${magnitude}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
   frame main()ret int{${setup}local result:float=${expression};if(!(Math.abs(result/x-1.0)<0.000000000001))return 1;return 0;}`,
      },
    ]);
  }, 60000);
}

test("scaled standard deviation retains ordinary, constant and boundary controls", () => {
  expectCorrectnessSuite([
    {
      name: "stddev-scaling-controls",
      validateLlvm: true,
      source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
  frame main()ret int{
   local ordinary:float[2]=[2.0,4.0];
   if(Stats.stddev(&ordinary[0],2)!=1.0||Math.abs(Stats.sampleStddev(&ordinary[0],2)-Math.sqrt(2.0))>0.000000000001)return 1;
   if(Stats.stddev(&ordinary[0],0)!=0.0||Stats.sampleStddev(&ordinary[0],1)!=0.0)return 2;
   local big:float=atof("1e308");local constant:float[2]=[big,big];
   if(Stats.stddev(&constant[0],2)!=0.0||Stats.sampleStddev(&constant[0],2)!=0.0)return 3;
   local pair:float[2]=[big,-big];local sample:float=Stats.sampleStddev(&pair[0],2);
   if(!(Math.abs(sample/big-Math.sqrt(2.0))<0.000000000001))return 4;
   local nonfinite:float[2]=[atof("inf"),1.0];
   if(!Math.isNan(Stats.stddev(&nonfinite[0],2))||!Math.isNan(Stats.sampleStddev(&nonfinite[0],2)))return 5;
   return 0;
  }`,
    },
  ]);
}, 60000);
