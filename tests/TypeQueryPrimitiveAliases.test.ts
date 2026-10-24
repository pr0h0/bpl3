import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, type, value] of [
  ["float", "float", "3.14"],
  ["f64", "f64", "3.14"],
  ["double", "double", "3.14"],
  ["f32", "f32", "cast<f32>(3.14)"],
] as const) {
  test(`generic queries preserve canonical ${name} identity`, () => {
    expectCorrectnessSuite([
      {
        name: `type-query-primitive-${name}`,
        validateLlvm: true,
        source: `frame matching<T>(value:T)ret bool{return match<${type}>(value)&&(value is ${type});}
      frame main()ret int{if(!matching<${type}>(${value}))return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
