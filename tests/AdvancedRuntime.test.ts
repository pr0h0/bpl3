import { describe, it, expect } from "bun:test";
import { compileAndRunFull } from "./helpers/compileAndRun";

/** Compile and run; failures are returned, not thrown. */
function runBPL(sourceCode: string) {
  return compileAndRunFull(sourceCode, { timeout: 60000 });
}

describe("Advanced Runtime Values", () => {
  it("should handle bitwise operations correctly", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local a: i32 = 0b1100; # 12
        local b: i32 = 0b1010; # 10

        printf("AND: %d\\n", a & b); # 8
        printf("OR: %d\\n", a | b);  # 14
        printf("XOR: %d\\n", a ^ b); # 6
        printf("NOT: %d\\n", ~a);    # -13 (for 32-bit signed)
        printf("LSHIFT: %d\\n", a << 1); # 24
        printf("RSHIFT: %d\\n", a >> 1); # 6
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Bitwise Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("AND: 8");
    expect(stdout).toContain("OR: 14");
    expect(stdout).toContain("XOR: 6");
    expect(stdout).toContain("NOT: -13");
    expect(stdout).toContain("LSHIFT: 24");
    expect(stdout).toContain("RSHIFT: 6");
  });

  it("should handle integer casting and truncation", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local large: i32 = 257;
        local small: u8 = cast<u8>(large); # Should be 1
        printf("Truncated: %d\\n", small);

        local neg: i32 = -1;
        local unsigned_val: u32 = cast<u32>(neg); # Should be huge
        printf("Unsigned: %u\\n", unsigned_val);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Casting Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Truncated: 1");
    // -1 as u32 is 4294967295
    expect(stdout).toContain("Unsigned: 4294967295");
  });

  it("should handle array indexing", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local arr: i32[3];
        arr[0] = 10;
        arr[1] = 20;
        arr[2] = 30;

        printf("%d %d %d\\n", arr[0], arr[1], arr[2]);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Array Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("10 20 30\n");
  });

  it("should handle pointer dereferencing", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local x: i32 = 42;
        local ptr: *i32 = &x;
        *ptr = 100;
        printf("%d\\n", x);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Pointer Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("100\n");
  });

  it("should handle string operations", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local s: string = "Hello";
        printf("%s\\n", s);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("String Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Hello\n");
  });

  it("should handle char literals", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local c: char = 'A';
        printf("%c %d\\n", c, c);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Char Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("A 65\n");
  });

  it("should handle division by zero", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local a: i32 = 10;
        local b: i32 = 0;
        printf("%d\\n", a / b);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Division by zero");
  });

  it("should handle infinite recursion (stack overflow)", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame recurse(n: i32) {
        printf("%d\\n", n);
        recurse(n + 1);
      }
      frame main() {
        recurse(1);
      }
    `;
    // Unbounded recursion overflows the stack and terminates the process.
    const { stdout, exitCode, timedOut } = runBPL(source);
    expect(timedOut).toBe(false);
    expect(exitCode).not.toBe(0);
    expect(stdout.startsWith("1\n2\n3\n")).toBe(true);
  });

  it("should handle float to int casting", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local f: double = -5.9;
        local i: i32 = cast<i32>(f);
        printf("%d\\n", i);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("FloatCast Stderr:", stderr);
    expect(exitCode).toBe(0);
    // Should truncate towards zero? Or floor?
    // C behavior: -5.
    expect(stdout).toBe("-5\n");
  });

  it("should handle modulus operator", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local a: i32 = 10;
        local b: i32 = 3;
        printf("%d\\n", a % b); # 1

        local c: i32 = -10;
        printf("%d\\n", c % b); # -1 or 2?
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Modulus Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1");
    // Check behavior for negative modulus
    console.log("Modulus Output:", stdout);
  });
});
