import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const incompatibleRows = [
  ["fixed rows to slice rows", "int[2][2]", "int[][]"],
  ["fixed rows to array of slices", "int[2][2]", "int[2][]"],
  ["view of fixed rows to view of slices", "int[][2]", "int[][]"],
  ["deeper row layout", "int[2][2][2]", "int[][2][]"],
  ["rows of pointers to slices of pointers", "*int[2][2]", "*int[][]"],
] as const;

for (const [name, sourceType, targetType] of incompatibleRows) {
  for (const aliases of [false, true]) {
    const sourceName = aliases ? "Source" : sourceType;
    const targetName = aliases ? "Target" : targetType;
    const prefix = aliases
      ? `type Source=${sourceType};type Target=${targetType};`
      : "";
    const contexts = [
      [
        "initializer",
        "E001",
        `frame bad(a:${sourceName}){local b:${targetName}=a;}`,
      ],
      [
        "assignment",
        "BPL_ASSIGNMENT_TYPE_MISMATCH",
        `frame bad(a:${sourceName},b:${targetName}){b=a;}`,
      ],
      [
        "argument",
        "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
        `frame take(b:${targetName}){} frame bad(a:${sourceName}){take(a);}`,
      ],
      [
        "return",
        "BPL_RETURN_TYPE_MISMATCH",
        `frame bad(a:${sourceName})ret ${targetName}{return a;}`,
      ],
    ] as const;
    for (const [context, code, body] of contexts) {
      test(`reject ${name} in ${context}${aliases ? " through aliases" : ""}`, () => {
        const source = `${prefix}${body}frame main()ret int{return 0;}`;
        const program = new Parser(
          source,
          "test.bpl",
          lexWithGrammar(source, "test.bpl"),
        ).parse();
        const checker = new TypeChecker({ collectAllErrors: true });
        checker.checkProgram(program);
        expect(checker.getErrors().some((error) => error.code === code)).toBe(
          true,
        );
      });
    }
  }
}

test("nested views preserve fixed rows and explicitly constructed slice rows at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "nested-array-view-layout-controls",
      validateLlvm: true,
      source: `type Row=int[2];type Grid=Row[2];type RowView=int[];
      frame write(rows:Row[]){rows[1][0]=7;}
      frame read<T>(rows:T[],index:int)ret T{return rows[index];}
      frame main()ret int{
        local grid:Grid=[[1,2],[3,4]];
        local view:Row[]=grid;write(grid);
        local selected:Row=read<Row>(view,1);
        if(selected[0]!=7 || grid[1][0]!=7) return 1;
        local other:Row[3]=[[5,6],[7,8],[9,10]];view=other;
        if(view[2][1]!=10) return 2;
        local left:Row=[11,12];local right:Row=[13,14];
        local rows:RowView[2]=[cast<RowView>(left),cast<RowView>(right)];
        local slices:int[][]=rows;slices[1][1]=42;
        if(right[1]!=42 || slices[0][0]!=11) return 3;
        local copy:int[][]=slices;if(copy[1][0]!=13) return 4;
        return 0;
      }`,
    },
  ]);
}, 60000);
