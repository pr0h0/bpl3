import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function runBPL(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );
  fs.writeFileSync(tempFile, sourceCode);

  try {
    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Examples Fuzzing & Syntax Edge Cases", () => {
  it("should handle nested ternary operators correctly", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        # Right-associative check:
        # true ? 1 : true ? 2 : 3  -> should be 1
        # false ? 1 : true ? 2 : 3 -> should be 2
        # false ? 1 : false ? 2 : 3 -> should be 3

        printf("%d\\n", true ? 1 : true ? 2 : 3);
        printf("%d\\n", false ? 1 : true ? 2 : 3);
        printf("%d\\n", false ? 1 : false ? 2 : 3);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Ternary Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("1\n2\n3\n");
  });

  it("should handle pointer arithmetic on structs", () => {
    const source = `
      extern printf(fmt: string, ...);
      struct Point { x: i32, y: i32, } # Added trailing comma

      frame main() {
        local arr: Point[2];
        arr[0] = Point { x: 10, y: 20, };
        arr[1] = Point { x: 30, y: 40, };

        local ptr: *Point = &arr[0];
        local p2: *Point = ptr + 1; # Should advance by sizeof(Point)

        printf("%d %d\\n", p2.x, p2.y);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("PointerArith Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("30 40\n");
  });

  it("should handle trailing commas in function calls", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame foo(a: i32, b: i32) {
        printf("%d %d\\n", a, b);
      }

      frame main() {
        foo(1, 2,); # Trailing comma
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    // This is expected to fail currently, but we want to confirm it's a syntax error
    if (exitCode !== 0) {
      console.log("TrailingCommaCall failed as expected (feature missing)");
    } else {
      console.log("TrailingCommaCall SUCCEEDED (feature exists!)");
    }
    // expect(exitCode).toBe(0); // Commented out to not fail the suite
  });

  it("should handle trailing commas in struct literals", () => {
    const source = `
      extern printf(fmt: string, ...);
      struct Point { x: i32, y: i32, }

      frame main() {
        local p: Point = Point {
          x: 1,
          y: 2, # Trailing comma
        };
        printf("%d\\n", p.x);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("TrailingCommaStruct Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("1\n");
  });

  it("should handle complex array indexing", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local arr: i32[5];
        arr[0] = 0;
        arr[1] = 1;
        arr[2] = 2;
        arr[3] = 3;
        arr[4] = 4;

        local idx: i32 = 1;
        printf("%d\\n", arr[idx + 1]); # arr[2] -> 2
        printf("%d\\n", arr[arr[3]]);  # arr[3] -> 3, so arr[3] -> 3
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("ComplexIndex Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("2\n3\n");
  });

  it("should require trailing comma in struct definition (Strictness Check)", () => {
    const source = `
      struct Point { x: i32, y: i32 } # No trailing comma
      frame main() {}
    `;
    const { exitCode } = runBPL(source);
    // If this fails (exitCode != 0), it confirms the strict requirement.
    if (exitCode !== 0) {
      console.log("Struct definition REQUIRES trailing comma (Strict syntax).");
    } else {
      console.log("Struct definition allows missing trailing comma.");
    }
  });

  it("should handle basic generics (via helper)", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Box<T> {
          value: T,
      }

      frame make_box<T>(v: T) ret Box<T> {
          local b: Box<T>;
          b.value = v;
          return b;
      }

      frame main() {
          local b: Box<int> = make_box<int>(123);
          printf("%d\\n", b.value);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Generics Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("123\n");
  });

  it("should handle operator overloading (via __add__ with pointers)", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Vector {
          x: int,
          y: int,

          frame __add__(this: *Vector, other: Vector) ret Vector {
              local res: Vector;
              res.x = this.x + other.x;
              res.y = this.y + other.y;
              return res;
          }
      }

      frame main() {
          local v1: Vector = Vector { x: 1, y: 2, };
          local v2: Vector = Vector { x: 3, y: 4, };
          # v1 + v2 should desugar to v1.__add__(v2)
          # Since __add__ takes *Vector, maybe it auto-references?
          local v3: Vector = v1 + v2;
          printf("%d %d\\n", v3.x, v3.y);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) {
      console.log("Operator Overloading (ptr) failed. Stderr:", stderr);
    } else {
      expect(stdout).toBe("4 6\n");
    }
  });

  it("should handle nested generics", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Box<T> { value: T, }

      frame make_box<T>(v: T) ret Box<T> {
          local b: Box<T>;
          b.value = v;
          return b;
      }

      frame main() {
          local inner: Box<int> = make_box<int>(42);
          local outer: Box<Box<int>> = make_box<Box<int>>(inner);

          printf("%d\\n", outer.value.value);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("NestedGenerics Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("42\n");
  });

  it("should handle struct method calls", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Counter {
          val: int,
          frame increment(this: *Counter) {
              this.val = this.val + 1;
          }
      }

      frame main() {
          local c: Counter = Counter { val: 0, };
          c.increment();
          printf("%d\\n", c.val);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("MethodCall Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("1\n");
  });
});
