import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("generic callback aliases preserve fixed-array modifiers", () => {
  expectCorrectnessSuite([
    {
      name: "generic-callback-array",
      validateLlvm: true,
      source: `
      type Callback<T>=Func<T>(T);type Fixed<T>=T[2];
      frame inc(x:int) ret int {return x+1;}
      frame dec(x:int) ret int {return x-1;}
      frame call_second(fs:Callback<int>[2],x:int) ret int {return fs[1](x);}
      frame main() ret int {
        local fs:Fixed<Callback<int>>;fs[0]=inc;fs[1]=dec;
        if(fs[0](41)!=42 || fs[1](43)!=42 || call_second(fs,43)!=42) return 1;
        return 0;
      }`,
    },
  ]);
}, 60000);

test("generic callable and tuple aliases retain outer dimensions", () => {
  for (const target of ["Func<T>(T)", "Lambda<T>(T)", "(T,T)"]) {
    const source = `
      type Value<T>=${target};
      frame fixed(values:Value<int>[3]) {}
      frame sliced(values:Value<int>[]) {}
    `;
    const ast = new Parser(
      source,
      "aliases.bpl",
      lexWithGrammar(source, "aliases.bpl"),
    ).parse();
    new TypeChecker().checkProgram(ast);
    const functions = ast.statements.filter((s) => s.kind === "FunctionDecl");
    const dimensions = functions.map((f) => {
      const signature = f.resolvedType!;
      if (signature.kind !== "FunctionType")
        throw new Error("Missing signature");
      const parameter = signature.paramTypes[0]!;
      return "arrayDimensions" in parameter
        ? parameter.arrayDimensions
        : undefined;
    });
    expect(dimensions).toEqual([[3], [null]]);
  }
});
