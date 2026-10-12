import { expect, test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { runSpecModules } from "./helpers/languageSpec";

test("global callable values load stored callbacks for reads and invocation", () => {
  expectCorrectnessSuite([
    {
      name: "global-callable-values",
      validateLlvm: true,
      source: `
    type Callback=Func<int>(int);
    global callback:Callback;
    global closure:Lambda<int>(int);
    frame inc(x:int) ret int {return x+1;}
    frame dec(x:int) ret int {return x-1;}
    frame apply(f:Callback,x:int) ret int {return f(x);}
    frame main() ret int {
      callback=inc;if(callback(41)!=42) return 1;
      local f:Callback=callback;if(f(41)!=42 || apply(callback,41)!=42) return 2;
      callback=dec;if(callback(43)!=42 || f(41)!=42) return 3;
      local offset:int=40;
      closure=|x:int| ret int {return offset+x;};
      if(closure(2)!=42) return 4;
      local g:Lambda<int>(int)=closure;if(g(2)!=42) return 5;
      closure=inc;if(closure(41)!=42) return 6;
      return 0;
    }
  `,
    },
  ]);
}, 60000);

test("imported callback globals and re-exports invoke the defining storage", () => {
  for (const opt of [0, 3] as const) {
    const result = runSpecModules(
      {
        "values.bpl": `export callback; export closure; export install;
        global callback:Func<int>(int);
        global closure:Lambda<int>(int);
        frame inc(x:int) ret int {return x+1;}
        frame install() {callback=inc;closure=inc;}`,
        "bridge.bpl":
          'export forwarded; import callback as forwarded from "./values.bpl";',
        "main.bpl": `
        import forwarded as exposed from "./bridge.bpl";
        import install from "./values.bpl";
        import * as bridge from "./bridge.bpl";
        import * as values from "./values.bpl";
        frame main() ret int {
          install();
          if(exposed(41)!=42 || bridge.forwarded(41)!=42 || values.callback(41)!=42) return 1;
          local f:Func<int>(int)=bridge.forwarded;
          if(f(41)!=42 || values.closure(41)!=42) return 2;
          return 0;
        }`,
      },
      "main.bpl",
      opt,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  }
}, 60000);
