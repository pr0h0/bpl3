import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, usage, target, other, setup] of [
  [
    "scalar alias",
    "type Number=int;",
    "Number[2]",
    "int[2]",
    "int[3]",
    "local value:Number[2]=[1,2];",
  ],
  [
    "generic alias",
    "type Identity<T>=T;",
    "Identity<int>[2]",
    "int[2]",
    "int[3]",
    "local value:Identity<int>[2]=[1,2];",
  ],
  [
    "tuple alias",
    "type Pair=(int,bool);",
    "Pair[2]",
    "(int,bool)[2]",
    "(int,bool)[3]",
    "local value:Pair[2]=[(1,true),(2,false)];",
  ],
  [
    "function alias",
    "type Callback=Func<int>(int);frame identity(value:int)ret int{return value;}",
    "Callback[2]",
    "Func<int>(int)[2]",
    "Func<int>(int)[3]",
    "local value:Callback[2]=[identity,identity];",
  ],
  [
    "lambda alias",
    "type Action=Lambda<int>(int);",
    "Action[2]",
    "Lambda<int>(int)[2]",
    "Lambda<int>(int)[3]",
    "local action:Action=|number:int| ret int{return number;};local value:Action[2]=[action,action];",
  ],
  [
    "nested array alias",
    "type Row=int[2];type Matrix=Row[3];",
    "Matrix",
    "int[3][2]",
    "int[2][3]",
    "local value:Matrix=[[1,2],[3,4],[5,6]];",
  ],
] as const) {
  test(`generic type queries preserve modifiers of ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `query-alias-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}frame same<T>(value:T)ret bool{return match<${target}>(value)&&(value is ${target})&&!match<${other}>(value)&&!(value is ${other});}
   frame main()ret int{${setup}if(!same<${usage}>(value))return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
