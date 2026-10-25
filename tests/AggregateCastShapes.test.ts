import { expect, test } from "bun:test";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { SymbolTable } from "../compiler/middleend/SymbolTable";
import { TypeComparison } from "../compiler/middleend/TypeUtils";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const invalidCasts = [
  ["slice to pointer", "int[]", "*int"],
  ["slice to integer", "int[]", "int"],
  ["slice to float", "int[]", "float"],
  ["fixed array to integer", "int[2]", "int"],
  ["integer to fixed array", "int", "int[2]"],
  ["integer to slice", "long", "int[]"],
  ["fixed array element width", "int[2]", "i64[2]"],
  ["slice element width", "int[]", "i64[]"],
  ["slice to fixed array", "int[]", "int[2]"],
  ["fixed array length", "int[2]", "int[3]"],
  ["pointer to slice", "*int", "int[]"],
  ["pointer to fixed array", "*int", "int[2]"],
  ["pointer array to integer", "*int[2]", "long"],
  ["pointer array reinterpretation", "*int[2]", "*char[2]"],
  ["pointer slice reinterpretation", "*int[]", "*char[]"],
  ["pointer slice to pointer", "*int[]", "**int"],
  ["nested array inner layout", "int[2][2]", "int[][]"],
  ["tuple slice to fixed array", "(int,int)[]", "(int,int)[2]"],
  ["callback slice to fixed array", "Func<int>(int)[]", "Func<int>(int)[2]"],
  ["callback array to scalar", "Func<int>(int)[2]", "Func<int>(int)"],
] as const;

for (const [name, sourceType, targetType] of invalidCasts) {
  for (const aliases of [false, true]) {
    test(`reject ${name}${aliases ? " through aliases" : ""} during checking`, () => {
      const source = `${aliases ? `type Source=${sourceType};type Target=${targetType};` : ""}
        frame bad(a:${aliases ? "Source" : sourceType}) {
          local b:${aliases ? "Target" : targetType}=cast<${aliases ? "Target" : targetType}>(a);
        }
        frame main() ret int {return 0;}`;
      const program = new Parser(
        source,
        "test.bpl",
        lexWithGrammar(source, "test.bpl"),
      ).parse();
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(program);
      const errors = checker.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(CompilerError);
      expect(errors[0]?.code).toBe("BPL_CAST_INVALID");
      expect(errors[0]?.message).toContain("Cannot cast");

      const bad = program.statements.find(
        (node) => node.kind === "FunctionDecl",
      )!;
      const variable = bad.body.statements[0]!;
      if (variable.kind !== "VariableDecl")
        throw new Error("Expected cast variable");
      const comparison = new TypeComparison(
        new SymbolTable(),
        (type) => checker.resolveType(type),
        () => false,
        () => false,
      );
      expect(
        comparison.isCastAllowed(bad.params[0]!.type, variable.typeAnnotation!),
      ).toBe(false);
    });
  }
}

test("supported aggregate views and scalar/pointer casts retain native behavior", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-cast-shape-controls",
      validateLlvm: true,
      source: `type Row=int[2];type RowPtr=*Row;type Rows=RowPtr[2];
      frame identity(x:int) ret int {return x;}
      frame convert<T>(a:Row) ret T {return cast<T>(a);}
      frame main() ret int {
        local a:Row=[3,4];local same:Row=cast<Row>(a);
        local converted:Row=convert<Row>(a);if(converted[1]!=4) return 9;
        local view:int[]=cast<int[]>(a);local sameView:int[]=cast<int[]>(view);
        local p:*int=cast<*int>(a);p[0]=5;
        if(a[0]!=5 || same[0]!=3 || sameView[0]!=5) return 1;
        local pointers:*int[2]=[&a[0],&a[1]];
        local pp:**int=cast<**int>(pointers);
        local pointerView:*int[]=cast<*int[]>(pointers);
        if(*pp[1]!=4 || *pointerView[0]!=5) return 2;
        local rowPointer:RowPtr=&a;
        local raw:*void=cast<*void>(rowPointer);
        local restored:RowPtr=cast<RowPtr>(raw);
        if(restored[1]!=4) return 3;
        local rows:Rows=[&a,&same];local rowView:RowPtr[]=cast<RowPtr[]>(rows);
        if(rowView[1][0]!=3) return 4;
        local tuples:(int,int)[2]=[(1,2),(3,4)];
        local tupleView:(int,int)[]=cast<(int,int)[]>(tuples);
        if(tupleView[1].1!=4) return 5;
        local callbacks:Func<int>(int)[2]=[identity,identity];
        local callbackView:Func<int>(int)[]=cast<Func<int>(int)[]>(callbacks);
        if(callbackView[1](7)!=7) return 6;
        local matrix:int[2][2]=[[1,2],[3,4]];
        local matrixView:int[][2]=cast<int[][2]>(matrix);
        if(matrixView[1][1]!=4) return 7;
        local narrowed:int=cast<int>(cast<float>(8));
        local roundtrip:*int=cast<*int>(cast<long>(&a[0]));
        if(narrowed!=8 || *roundtrip!=5) return 8;
        return 0;
      }`,
    },
  ]);
}, 60000);
