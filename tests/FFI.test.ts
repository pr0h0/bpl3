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

  try {
    fs.writeFileSync(tempFile, sourceCode);

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

describe("FFI (Foreign Function Interface)", () => {
  it("should call standard libc functions", () => {
    const source = `
      extern printf(fmt: string, ...);
      extern strlen(s: string) ret i32;

      frame main() {
        local s: string = "Hello World";
        local len: i32 = strlen(s);
        printf("Length: %d\\n", len);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Libc Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Length: 11\n");
  });

  it("should handle variadic functions", () => {
    const source = `
      extern printf(fmt: string, ...);
      extern sprintf(buf: *u8, fmt: string, ...);
      extern malloc(size: i64) ret *void;
      extern free(ptr: *void);

      frame main() {
        local buf: *void = malloc(100);
        local buf_ptr: *u8 = cast<*u8>(buf);

        sprintf(buf_ptr, "Value: %d, Float: %.1f", 42, 3.14);
        printf("Result: %s\\n", buf_ptr);

        free(buf);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Variadic Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Result: Value: 42, Float: 3.1");
  });

  it("should handle passing pointers to structs to extern functions", () => {
    // We can't easily test this without a custom C library,
    // but we can simulate it by passing a struct pointer to a function that expects void* (like free)
    // or just verifying it compiles and runs.
    const source = `
      extern printf(fmt: string, ...);
      struct Point { x: i32, y: i32, }

      frame main() {
        local p: Point = Point { x: 10, y: 20, };
        local ptr: *Point = &p;

        # printf %p expects void* usually, but in C varargs it takes anything.
        # In BPL, we might need to cast to *void or similar if strict.
        # But let's try passing *Point directly to ...
        printf("Pointer: %p\\n", ptr);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("StructPtr Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Pointer: 0x");
  });
});
