import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
for (const [name, setup, expected] of [
  [
    "offset",
    'local x:float=atof("1e16");local a:float[2]=[x,x+2.0];local b:float[2]=[x,x+2.0];',
    "1.0",
  ],
  [
    "positive scale",
    'local x:float=atof("1e154");local a:float[2]=[x,-x];local b:float[2]=[x,-x];',
    'atof("1e308")',
  ],
  [
    "negative scale",
    'local x:float=atof("1e154");local a:float[2]=[x,-x];local b:float[2]=[-x,x];',
    '-atof("1e308")',
  ],
] as const) {
  test(`covariance preserves ${name} results`, () => {
    expectCorrectnessSuite([
      {
        name: `covariance-stable-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;frame main()ret int{${setup}local expected:float=${expected};if(!(Math.abs(Stats.covariance(&a[0],&b[0],2)/expected-1.0)<0.000000000001))return 1;if(!(Math.abs(Stats.covariance(&b[0],&a[0],2)/expected-1.0)<0.000000000001))return 2;return 0;}`,
      },
    ]);
  }, 60000);
}

test("covariance retains ordinary, scale-order and nonfinite controls", () => {
  expectCorrectnessSuite([
    {
      name: "covariance-stable-controls",
      validateLlvm: true,
      source: `import [Stats] from "std/stats.bpl";import [Math] from "std/math.bpl";extern atof(value:string)ret float;
  frame main()ret int{
   local x:float[3]=[1.0,2.0,3.0];local y:float[3]=[2.0,4.0,6.0];
   if(!(Math.abs(Stats.covariance(&x[0],&y[0],3)-4.0/3.0)<0.000000000001))return 1;
   if(x[0]!=1.0||y[0]!=2.0)return 2;
   if(Stats.covariance(&x[0],&y[0],0)!=0.0||Stats.covariance(&x[0],&y[0],1)!=0.0)return 3;
   local tiny:float=atof("5e-324");local huge:float=atof("1e308");local a:float[2]=[0.0,tiny];local b:float[2]=[0.0,huge];local expected:float=tiny*huge/4.0;
   if(!(Math.abs(Stats.covariance(&a[0],&b[0],2)/expected-1.0)<0.000000000001))return 4;
   if(!(Math.abs(Stats.covariance(&b[0],&a[0],2)/expected-1.0)<0.000000000001))return 5;
   a[0]=huge;a[1]=-huge;b[0]=huge;b[1]=-huge;
   local overflow:float=Stats.covariance(&a[0],&b[0],2);if(!Math.isInfinite(overflow)||!(overflow>0.0))return 6;
   b[0]=atof("inf");if(!Math.isNan(Stats.covariance(&a[0],&b[0],2)))return 7;
   b[0]=atof("nan");if(!Math.isNan(Stats.covariance(&a[0],&b[0],2)))return 8;
   return 0;
  }`,
    },
  ]);
}, 60000);
