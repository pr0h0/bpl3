import { describe, expect, it } from "bun:test";

import { compileAndRun, compileAndRunFull } from "./helpers";

describe("Bug Fixes Batch 6", () => {
  it("BUG-069: should assign fixed-size arrays to dynamic slices", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame bumpSecond(values: int[]) {
        values[1] = values[1] + 20;
      }

      frame main() ret int {
        local fixed: int[3] = [10, 20, 12];
        local slice: int[] = fixed;
        bumpSecond(slice);
        printf("%d %d %d\\n", slice[0], fixed[1], slice[2]);
        return 0;
      }
    `);

    expect(output).toBe("10 40 12\n");
  });

  it("BUG-069: should initialize dynamic slices from array literals", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame sum(values: int[]) ret int {
        return values[0] + values[1] + values[2];
      }

      frame main() ret int {
        local slice: int[] = [3, 4, 5];
        printf("%d\\n", sum(slice));
        return 0;
      }
    `);

    expect(output).toBe("12\n");
  });

  it("BUG-069: should pass fixed-size arrays directly to dynamic slice parameters", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame bumpLast(values: int[]) {
        values[2] = values[2] + 7;
      }

      frame main() ret int {
        local fixed: int[3] = [1, 2, 3];
        bumpLast(fixed);
        printf("%d\\n", fixed[2]);
        return 0;
      }
    `);

    expect(output).toBe("10\n");
  });

  it("BUG-069: should pass multidimensional fixed arrays to outer dynamic slice parameters", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame setCell(rows: int[][2]) {
        rows[1][1] = 77;
      }

      frame main() ret int {
        local matrix: int[2][2];
        matrix[1][1] = 5;
        setCell(matrix);
        printf("%d\\n", matrix[1][1]);
        return 0;
      }
    `);

    expect(output).toBe("77\n");
  });

  it("BUG-069: should bounds-check slices created from fixed arrays using the fixed length", () => {
    const result = compileAndRunFull(`
      frame readPastEnd(values: int[]) ret int {
        return values[3];
      }

      frame main() ret int {
        local fixed: int[3] = [1, 2, 3];
        return readPastEnd(fixed);
      }
    `);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      "Array index 3 is out of bounds for size 3",
    );
  });

  it("BUG-140: should decay fixed arrays to raw pointers in local initializers", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
        local fixed: int[3] = [1, 2, 3];
        local ptr: *int = fixed;
        printf("%d\\n", ptr[2]);
        return 0;
      }
    `);

    expect(output).toBe("3\n");
  });

  it("BUG-146: should index rows through pointer-to-array aliases", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      type IntArray = int[3];

      frame readCell(rows: *IntArray, row: int, col: int) ret int {
        return (*(rows + row))[col];
      }

      frame main() ret int {
        local matrix: int[2][3];
        matrix[1][2] = 42;

        local rows: *IntArray = &matrix[0];
        printf("%d\\n", readCell(rows, 1, 2));
        return 0;
      }
    `);

    expect(output).toBe("42\n");
  });

  it("BUG-086: should index inside pointer-to-array aliases", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      type Arr = int[4];

      frame main() ret int {
        local values: int[4];
        local ptr: *Arr = &values;

        ptr[0] = 7;
        ptr[1] = 11;
        printf("%d %d\\n", ptr[0], ptr[1]);
        return 0;
      }
    `);

    expect(output).toBe("7 11\n");
  });

  it("BUG-147: should infer nested array literal dimensions in declaration order", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
        local matrix: int[2][3] = [
          [1, 2, 3],
          [4, 5, 6],
        ];

        printf("%d %d\\n", matrix[0][2], matrix[1][0]);
        return 0;
      }
    `);

    expect(output).toBe("3 4\n");
  });
});
