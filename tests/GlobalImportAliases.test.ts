import { expect, test } from "bun:test";
import { runSpecModules } from "./helpers/languageSpec";

// spec: R-MOD-2, R-MOD-6, R-MOD-7
test("global aliases and re-exports share the defining module's storage at O0/O3", () => {
  for (const level of [0, 3] as const) {
    const result = runSpecModules(
      {
        "values.bpl":
          "export value; global value:int=42; export [ID]; type ID=int;",
        "bridge.bpl":
          'export forwarded; import value as forwarded from "./values.bpl";',
        "main.bpl": `
import forwarded as exposed from "./bridge.bpl";
import value as original from "./values.bpl";
import * as bridge from "./bridge.bpl";
frame main() ret int {
 local forwarded:int=100;
 local pointer:*int=&exposed;
 *pointer+=1;
 if(original!=43 || bridge.forwarded!=43 || forwarded!=100)return 1;
 bridge.forwarded=44;
 if(exposed!=44)return 2;
 return 0;
}`,
      },
      "main.bpl",
      level,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  }
});
