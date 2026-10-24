import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
for (const [name, setup, length, expected] of [
  [
    "large positive",
    'local v:float=atof("1e308");local a:float[2]=[v,-v];local b:float[2]=[v,-v];',
    "2",
    "1.0",
  ],
  [
    "tiny positive",
    'local v:float=atof("1e-200");local a:float[2]=[v,-v];local b:float[2]=[v,-v];',
    "2",
    "1.0",
  ],
  [
    "large negative",
    'local v:float=atof("1e308");local a:float[2]=[v,-v];local b:float[2]=[-v,v];',
    "2",
    "-1.0",
  ],
  [
    "large partial",
    'local v:float=atof("1e308");local a:float[3]=[v,-v,0.0];local b:float[3]=[v,0.0,-v];',
    "3",
    "0.5",
  ],
  [
    "subnormal endpoint",
    'local v:float=atof("5e-324");local a:float[2]=[0.0,v];local b:float[2]=[0.0,v];',
    "2",
    "1.0",
  ],
] as const) {
  test(`correlation preserves ${name} coefficients`, () => {
    expectCorrectnessSuite([
      {
        name: `correlation-stable-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;frame main()ret int{${setup}local expected:float=${expected};local result:float=Stats.correlation(&a[0],&b[0],${length});if(!(Math.abs(result-expected)<0.000000000001))return 1;if(result < -1.0 || result > 1.0)return 2;return 0;}`,
      },
    ]);
  }, 60000);
}

test("correlation retains ordinary, zero-variance and nonfinite controls", () => {
  expectCorrectnessSuite([
    {
      name: "correlation-stable-controls",
      validateLlvm: true,
      source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
  frame main()ret int{
   local x:float[3]=[1.0,2.0,3.0];local y:float[3]=[2.0,4.0,6.0];local z:float[3]=[2.0,1.0,4.0];
   if(!(Math.abs(Stats.correlation(&x[0],&y[0],3)-1.0)<0.000000000001))return 1;
   if(!(Math.abs(Stats.correlation(&x[0],&z[0],3)-Math.sqrt(3.0/7.0))<0.000000000001))return 2;
   if(Stats.correlation(&x[0],&y[0],0)!=0.0||Stats.correlation(&x[0],&y[0],1)!=0.0)return 3;
   local a:float[4]=[-1.0,-1.0,1.0,1.0];local b:float[4]=[-1.0,1.0,-1.0,1.0];
   if(!(Math.abs(Stats.correlation(&a[0],&b[0],4))<0.000000000001))return 4;
   local constant:float[2]=[7.0,7.0];local invalid:float[2]=[atof("inf"),1.0];
   if(Stats.correlation(&constant[0],&invalid[0],2)!=0.0||Stats.correlation(&invalid[0],&constant[0],2)!=0.0)return 5;
   if(!Math.isNan(Stats.correlation(&x[0],&invalid[0],2)))return 6;
   invalid[0]=atof("nan");if(!Math.isNan(Stats.correlation(&x[0],&invalid[0],2)))return 7;
   local tiny:float[2]=[0.0,atof("5e-324")];
   if(Stats.correlation(&tiny[0],&invalid[0],2)!=0.0)return 8;
   if(x[0]!=1.0||y[0]!=2.0)return 9;
   local base:float=atof("1e16");local offset:float[2]=[base,base+2.0];local coefficient:float=Stats.correlation(&offset[0],&offset[0],2);
   if(!(Math.abs(coefficient-1.0)<0.000000000001)||coefficient>1.0||coefficient < -1.0)return 10;
   return 0;
  }`,
    },
  ]);
}, 60000);
