import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function compileAndRun(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });

    if (result.status !== 0) {
      console.error("Compilation/Run failed:");
      console.error(result.stderr);
      console.error(result.stdout);
      throw new Error(`BPL execution failed with code ${result.status}`);
    }

    return result.stdout;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("User Operator Overloading", () => {
  test("Arithmetic operators", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      struct Vector2 {
        x: i32,
        y: i32,

        frame new(x: i32, y: i32) ret Vector2 {
            local v: Vector2;
            v.x = x;
            v.y = y;
            return v;
        }

        frame __add__(this: *Vector2, other: Vector2) ret Vector2 {
            return Vector2.new(this.x + other.x, this.y + other.y);
        }

        frame __sub__(this: *Vector2, other: Vector2) ret Vector2 {
            return Vector2.new(this.x - other.x, this.y - other.y);
        }

        frame __mul__(this: *Vector2, scalar: i32) ret Vector2 {
            return Vector2.new(this.x * scalar, this.y * scalar);
        }
      }

      frame main() {
        local v1: Vector2 = Vector2.new(10, 20);
        local v2: Vector2 = Vector2.new(5, 5);

        local v3: Vector2 = v1 + v2;
        printf("Add: %d, %d\\n", v3.x, v3.y);

        local v4: Vector2 = v1 - v2;
        printf("Sub: %d, %d\\n", v4.x, v4.y);

        local v5: Vector2 = v1 * 2;
        printf("Mul: %d, %d\\n", v5.x, v5.y);
      }
    `);

    expect(output).toContain("Add: 15, 25");
    expect(output).toContain("Sub: 5, 15");
    expect(output).toContain("Mul: 20, 40");
  });

  test("Comparison operators", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      struct Box {
        val: i32,

        frame __eq__(this: *Box, other: Box) ret bool {
            return this.val == other.val;
        }

        frame __lt__(this: *Box, other: Box) ret bool {
            return this.val < other.val;
        }
      }

      frame main() {
        local b1: Box; b1.val = 10;
        local b2: Box; b2.val = 10;
        local b3: Box; b3.val = 20;

        if (b1 == b2) {
            printf("b1 == b2\\n");
        }

        if (b1 != b3) {
            printf("b1 != b3\\n");
        }

        if (b1 < b3) {
            printf("b1 < b3\\n");
        }

        if (b3 > b1) {
            printf("b3 > b1\\n");
        }
      }
    `);

    expect(output).toContain("b1 == b2");
    expect(output).toContain("b1 != b3");
    expect(output).toContain("b1 < b3");
    expect(output).toContain("b3 > b1");
  });
});
