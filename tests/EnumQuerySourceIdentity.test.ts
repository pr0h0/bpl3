import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, setup] of [
  ["integer", "", "local value:int=0;"],
  ["tuple", "", "local value:(int,bool)=(0,true);"],
  ["other enum", "enum Other{Red,Blue,}", "local value:Other=Other.Red;"],
  [
    "generic other enum",
    "enum Other<T>{Item(T),}",
    "local value:Other<int>=Other<int>.Item(7);",
  ],
  ["array", "", "local value:Color[2]=[Color.Red,Color.Blue];"],
  ["slice", "", "local value:Color[]=[Color.Red,Color.Blue];"],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    test(`${syntax} rejects ${name} as a scalar Color variant match`, () => {
      const query =
        syntax === "match" ? "match<Color.Red>(value)" : "value is Color.Red";
      expectCorrectnessSuite([
        {
          name: `enum-query-source-${name.replaceAll(" ", "-")}-${syntax}`,
          validateLlvm: true,
          source: `enum Color{Red,Blue,}${declarations}frame main()ret int{${setup}if(${query})return 1;return 0;}`,
        },
      ]);
    }, 60000);
  }
}
test("variant queries preserve aliases and generic enum values", () => {
  expectCorrectnessSuite([
    {
      name: "enum-query-source-controls",
      validateLlvm: true,
      source: `enum Color{Red,Blue,}type Shade=Color;enum Option<T>{Some(T),None,}frame same<T>(value:Option<T>)ret bool{return match<Option.Some>(value)&&(value is Option.Some);}
    frame main()ret int{local color:Shade=Color.Red;if(!match<Color.Red>(color)||!(color is Color.Red)||color is Color.Blue)return 1;local option:Option<int>=Option<int>.Some(7);if(!same<int>(option))return 2;return 0;}`,
    },
  ]);
}, 60000);
