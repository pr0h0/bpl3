import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, setup, expression, check] of [
  [
    "population finite",
    'local x:float=atof("1e154");local values:float[2]=[x,-x];',
    "Stats.variance(&values[0],2)",
    'Math.abs(result / atof("1e308") - 1.0) < 0.000000000001',
  ],
  [
    "sample finite",
    'local x:float=atof("1e154");local values:float[3]=[x,-x,0.0];',
    "Stats.sampleVariance(&values[0],3)",
    'Math.abs(result / atof("1e308") - 1.0) < 0.000000000001',
  ],
  [
    "population positive overflow",
    'local x:float=atof("1e308");local values:float[2]=[-x,x];',
    "Stats.variance(&values[0],2)",
    "Math.isInfinite(result) && result > 0.0",
  ],
] as const) {
  test(`floating variance scaling preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `variance-scaling-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;frame main()ret int{${setup}local result:float=${expression};if(!(${check}))return 1;return 0;}`,
      },
    ]);
  }, 60000);
}

test("variance scaling preserves ordinary, constant, empty and nonfinite inputs", () => {
  expectCorrectnessSuite([
    {
      name: "variance-scaling-controls",
      validateLlvm: true,
      source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
    frame main()ret int{
      local ordinary:float[2]=[2.0,4.0];
      if(Stats.variance(&ordinary[0],2)!=1.0||Stats.sampleVariance(&ordinary[0],2)!=2.0)return 1;
      local big:float=atof("1e308");local constant:float[2]=[big,big];
      if(Stats.variance(&constant[0],2)!=0.0||Stats.sampleVariance(&constant[0],2)!=0.0)return 2;
      if(Stats.variance(&ordinary[0],0)!=0.0||Stats.sampleVariance(&ordinary[0],1)!=0.0)return 3;
      local nonfinite:float[2]=[atof("inf"),1.0];
      if(!Math.isNan(Stats.variance(&nonfinite[0],2))||!Math.isNan(Stats.sampleVariance(&nonfinite[0],2)))return 4;
      nonfinite[0]=atof("nan");
      if(!Math.isNan(Stats.variance(&nonfinite[0],2))||!Math.isNan(Stats.sampleVariance(&nonfinite[0],2)))return 5;
      return 0;
    }`,
    },
  ]);
}, 60000);
