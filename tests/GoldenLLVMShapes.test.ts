import { describe, expect, it } from "bun:test";

import { compileToLLVM, countMatches } from "./helpers";

describe("Golden LLVM Shape Checks", () => {
  it("lowers fixed arrays assigned to slices as pointer-length views", () => {
    const ir = compileToLLVM(`
      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
        local fixed: int[3] = [10, 20, 30];
        local slice: int[] = fixed;
        printf("%d\\n", slice[1]);
        return 0;
      }
    `);

    expect(ir).toContain("alloca [3 x i32]");
    expect(ir).toContain("alloca { i32*, i64 }");
    expect(ir).toMatch(
      /getelementptr inbounds \[3 x i32\], \[3 x i32\]\* %fixed_ptr\.\d+, i64 0, i64 0/,
    );
    expect(ir).toContain("insertvalue { i32*, i64 } undef, i32*");
    expect(ir).toContain("insertvalue { i32*, i64 }");
    expect(ir).toContain("i64 3, 1");
    expect(ir).not.toContain("memcpy");
  });

  it("passes fixed arrays to slice parameters without copying the array", () => {
    const ir = compileToLLVM(`
      frame sum(values: int[]) ret int {
        return values[0] + values[1] + values[2];
      }

      frame main() ret int {
        local fixed: int[3] = [4, 5, 6];
        return sum(fixed);
      }
    `);

    expect(ir).toMatch(/call i32 @sum_i32_arr_null_\(\{ i32\*, i64 \} %\d+\)/);
    expect(ir).toContain("getelementptr inbounds [3 x i32]");
    expect(ir).not.toContain("memcpy");
  });

  it("passes nested fixed arrays to outer dynamic slice parameters without copying", () => {
    const ir = compileToLLVM(`
      frame readCell(rows: int[][2]) ret int {
        return rows[1][1];
      }

      frame main() ret int {
        local matrix: int[2][2];
        matrix[1][1] = 44;
        return readCell(matrix);
      }
    `);

    expect(ir).toContain("alloca [2 x [2 x i32]]");
    expect(ir).toContain("{ [2 x i32]*, i64 }");
    expect(ir).toMatch(
      /getelementptr inbounds \[2 x \[2 x i32\]\], \[2 x \[2 x i32\]\]\* %matrix_ptr\.\d+, i64 0, i64 0/,
    );
    expect(ir).toMatch(
      /call i32 @readCell_[^(]+\(\{ \[2 x i32\]\*, i64 \} %\d+\)/,
    );
    expect(ir).not.toContain("memcpy");
  });

  it("materializes slice literals once and lowers them as pointer-length views", () => {
    const ir = compileToLLVM(`
      frame readLast(values: int[]) ret int {
        return values[2];
      }

      frame main() ret int {
        local slice: int[] = [9, 8, 7];
        return readLast(slice);
      }
    `);

    expect(ir).toContain("alloca [3 x i32]");
    expect(ir).toContain("store [3 x i32]");
    expect(ir).toMatch(
      /getelementptr inbounds \[3 x i32\], \[3 x i32\]\* %array_lit_\d+_ptr\.\d+, i64 0, i64 0/,
    );
    expect(ir).toContain("insertvalue { i32*, i64 }");
    expect(ir).toContain("i64 3, 1");
    expect(ir).not.toContain("memcpy");
  });

  it("keeps Func values as thin function pointers", () => {
    const ir = compileToLLVM(`
      type Binary = Func<int>(int, int);

      frame add(a: int, b: int) ret int {
        return a + b;
      }

      frame apply(fn: Binary, a: int, b: int) ret int {
        return fn(a, b);
      }
    `);

    expect(ir).toMatch(/define i32 @apply_[^(]+\(i32 \(i32, i32\)\* %fn/);
    expect(ir).toMatch(/call i32 %\d+\(i32 %\d+, i32 %\d+\)/);
    expect(ir).not.toContain("{ i32 (i8*, i32, i32)*, i8* }");
  });

  it("keeps Lambda values as fat closures", () => {
    const ir = compileToLLVM(`
      frame makeAdder(base: int) ret Lambda<int>(int) {
        return |x: int| ret int {
          return base + x;
        };
      }
    `);

    expect(ir).toContain("{ i32 (i8*, i32)*, i8* }");
    expect(countMatches(ir, /insertvalue \{ i32 \(i8\*, i32\)\*, i8\* \}/g)).toBeGreaterThan(0);
  });

  it("keeps arrays of Func values as arrays of thin function pointers", () => {
    const ir = compileToLLVM(`
      type Binary = Func<int>(int, int);

      frame add(a: int, b: int) ret int {
        return a + b;
      }

      frame main() ret int {
        local funcs: Binary[2];
        funcs[0] = add;
        return funcs[0](2, 3);
      }
    `);

    expect(ir).toContain("alloca [2 x i32 (i32, i32)*]");
    expect(ir).toMatch(/store i32 \(i32, i32\)\* @add_/);
    expect(ir).not.toContain("{ i32 (i8*, i32, i32)*, i8* }");
  });

  it("lowers pointer indexing through aliases to direct getelementptr", () => {
    const ir = compileToLLVM(`
      type IntPtr = *int;

      frame readAt(values: IntPtr, index: int) ret int {
        return values[index];
      }
    `);

    expect(ir).not.toContain("IntPtr");
    expect(ir).toMatch(/getelementptr inbounds i32|getelementptr i32/);
    expect(ir).not.toMatch(/call .*index/i);
  });

  it("passes pointer-to-array aliases as row pointers without array decay", () => {
    const ir = compileToLLVM(`
      type IntArray = int[3];

      frame readCell(rows: *IntArray, row: int, col: int) ret int {
        return (*(rows + row))[col];
      }

      frame main() ret int {
        local matrix: int[2][3];
        local rows: *IntArray = &matrix[0];
        return readCell(rows, 1, 2);
      }
    `);

    expect(ir).toMatch(/define i32 @readCell_[^(]+\(\[3 x i32\]\* %rows/);
    expect(ir).toMatch(/call i32 @readCell_[^(]+\(\[3 x i32\]\* %\d+/);
    expect(ir).not.toMatch(
      /getelementptr inbounds \[3 x i32\]\*, \[3 x i32\]\*\* %rows_ptr/,
    );
  });

  it("marks typed enum payload byte-buffer accesses as unaligned", () => {
    const ir = compileToLLVM(`
      enum Payload {
        Tuple(i8, double),
        Struct { tag: i8, value: long },
      }

      frame readTuple(payload: Payload) ret double {
        return match (payload) {
          Payload.Tuple(_, value) => value,
          Payload.Struct { tag: _, value: _ } => 0.0,
        };
      }

      frame readStruct(payload: Payload) ret long {
        return match (payload) {
          Payload.Tuple(_, _) => 0,
          Payload.Struct { tag: _, value: value } => value,
        };
      }

      frame main() ret int {
        local tuplePayload: Payload = Payload.Tuple(1, 2.5);
        local structPayload: Payload = Payload.Struct { tag: 2, value: 99 };
        local _tupleValue: double = readTuple(tuplePayload);
        local _structValue: long = readStruct(structPayload);
        return 0;
      }
    `);

    expect(ir).toMatch(
      /bitcast i8\* %[^\n]+ to double\*\n\s+store double [^,]+, double\* %\d+, align 1/,
    );
    expect(ir).toMatch(
      /bitcast i8\* %[^\n]+ to i64\*\n\s+store i64 [^,]+, i64\* %\d+, align 1/,
    );
    expect(ir).toMatch(
      /bitcast i8\* %[^\n]+ to double\*\n\s+%\d+ = load double, double\* %\d+, align 1/,
    );
    expect(ir).toMatch(
      /bitcast i8\* %[^\n]+ to i64\*\n\s+%\d+ = load i64, i64\* %\d+, align 1/,
    );
  });
});
