import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const syntax of ["match", "is"] as const) {
  for (const nested of [false, true]) {
    const target = nested ? "(Func<int>(string),int)" : "Func<int>(string)";
    const query = (value: string) =>
      syntax === "match"
        ? `match<${target}>(${value})`
        : `(${value}) is ${target}`;
    test(`${syntax} distinguishes ${nested ? "nested" : "direct"} variadic function identity`, () => {
      expectCorrectnessSuite([
        {
          name: `callable-variadic-query-${syntax}-${nested}`,
          validateLlvm: true,
          source: `extern printf(format:string,...)ret int;
        frame fixed(format:string)ret int{format;return 7;}
        frame main()ret int{
          if(${query(nested ? "(printf,7)" : "printf")})return 1;
          if(!(${query(nested ? "(fixed,7)" : "fixed")}))return 2;
          return 0;
        }`,
        },
      ]);
    }, 60000);
  }
}
