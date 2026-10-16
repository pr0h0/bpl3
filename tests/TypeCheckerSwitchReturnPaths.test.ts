import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

function errors(body: string) {
  const source = `frame value(x:int)ret int { ${body} }`;
  const program = new Parser(
    source,
    "switch.bpl",
    lexWithGrammar(source, "switch.bpl"),
  ).parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(program);
  return checker.getErrors().map((e) => e.message);
}

test("switch return analysis includes unmatched inputs, defaults and reachable transfers", () => {
  for (const body of [
    "switch(x){case 1:{return 10;}}",
    "switch(x){case 1:{return 10;}default:{break;}}",
    "switch(x){case 1:{break;return 10;}default:{return 20;}}",
    "switch(x){case 1:{if(x>0){break;}return 10;}default:{return 20;}}",
    "switch(x){case 1:{if(x>0){return 10;}else{break;}}default:{return 20;}}",
    "switch(x){case 1:{try{break;}catch{return 4;}return 10;}default:{return 20;}}",
  ])
    expect(
      errors(body).some((e) =>
        e.includes("may not return a value on all code paths"),
      ),
      body,
    ).toBe(true);
  for (const body of [
    "switch(x){case 1:{return 10;}default:{return 20;}}",
    "switch(x){case 1:{fallthrough;}default:{return 20;}}",
    "switch(x){case 1:{fallthrough;}case 2:{return 10;}default:{return 20;}}",
    "switch(x){case 1:{return 10;break;}default:{return 20;}}",
    "switch(x){case 1:{loop{break;}return 10;}default:{return 20;}}",
    "switch(x){case 1:{switch(x){default:{break;}}return 10;}default:{return 20;}}",
    "switch(x){case 1:{break;}default:{return 20;}}return 30;",
  ])
    expect(
      errors(body).filter(
        (message) => message !== "Unreachable code detected.",
      ),
      body,
    ).toEqual([]);
});

test("fallthrough and default returns execute consistently at O0 and O3", () => {
  const source = `import printf from "std/c.bpl";
 frame value(x:int)ret int{switch(x){case 1:{fallthrough;}case 2:{return 10;}default:{return 20;}}}
 frame main()ret int{printf("%d %d %d\\n",value(1),value(2),value(99));return 0;}`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("10 10 20\n");
  }
}, 60000);
