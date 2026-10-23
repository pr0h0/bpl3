import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, setup, matching, different] of [
  [
    "tuple array length",
    "",
    "local value:(int,bool)[2]=[(1,true),(2,false)];",
    "(int,bool)[2]",
    "(int,bool)[3]",
  ],
  [
    "function array length",
    "frame identity(value:int)ret int{return value;}",
    "local value:Func<int>(int)[2]=[identity,identity];",
    "Func<int>(int)[2]",
    "Func<int>(int)[3]",
  ],
  [
    "lambda array length",
    "",
    "local action:Lambda<int>(int)=|number:int| ret int{return number;};local value:Lambda<int>(int)[2]=[action,action];",
    "Lambda<int>(int)[2]",
    "Lambda<int>(int)[3]",
  ],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    const query = (target: string) =>
      syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
    test(`${syntax} distinguishes ${name} at O0/O3`, () => {
      expectCorrectnessSuite([
        {
          name: `query-shape-${syntax}-${name.replaceAll(" ", "-")}`,
          validateLlvm: true,
          source: `${declarations}frame main()ret int{${setup}if(!(${query(matching)}))return 1;if(${query(different)})return 2;return 0;}`,
        },
      ]);
    }, 60000);
  }
}
