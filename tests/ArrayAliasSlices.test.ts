import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// spec: R-ARR-3, R-ARR-8, R-DECL-4
test("array alias slices preserve outer dimensions and view storage at O0/O3", () => {
  expectCorrectnessSuite(
    [
      {
        name: "row-slice-argument-and-local",
        source: `
type Row=int[2];
frame cell(rows:Row[],i:int,j:int) ret int {return rows[i][j];}
frame main() ret int {
 local grid:int[3][2];grid[2][1]=42;
 local view:Row[]=grid;
 view[1][0]=7;
 if(cell(grid,2,1)!=42 || grid[1][0]!=7)return 1;
 local other:int[4][2];other[3][0]=9;view=other;
 if(cell(view,3,0)!=9)return 2;
 return 0;
}`,
      },
      {
        name: "alias-chain-and-generic-views",
        source: `
type Row=int[2];type Grid=Row[3];type Rows<T>=T[];type View=Rows<Row>;
frame cell(rows:View,i:int,j:int) ret int {return rows[i][j];}
frame select<T>(items:T[],index:int) ret T {return items[index];}
frame main() ret int {
 local grid:Grid;grid[2][1]=42;
 local row:Row=select<Row>(grid,2);
 if(row[1]!=42 || cell(grid,2,1)!=42)return 1;
 local scalars:int[]=row;scalars[0]=8;
 if(row[0]!=8)return 2;
 return 0;
}`,
      },
    ].map((entry) => ({ ...entry, validateLlvm: true, expectedStdout: "" })),
  );
}, 60000);

// spec: R-ARR-5, R-ARR-6
test("array alias slices keep independent outer and inner bounds checks", () => {
  expectRuntimeFailureSuite(
    [3, 2].map((index, axis) => ({
      name: `alias-slice-bounds-${axis}`,
      expectedMessage: "INDEX OUT OF BOUNDS",
      source: `type Row=int[2];
frame read(rows:Row[]) ret int {return rows[${axis === 0 ? index : 0}][${axis === 1 ? index : 0}];}
frame main() ret int {local grid:int[3][2];return read(grid);}`,
    })),
  );
}, 60000);

test("array alias slices reject incompatible row widths", () => {
  expectCheckDiagnostics([
    {
      name: "alias-slice-row-width",
      source:
        "type Row=int[2]; frame read(rows:Row[]) ret int {return rows[0][0];} frame main() ret int {local grid:int[3][3];return read(grid);}",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
    },
  ]);
});
