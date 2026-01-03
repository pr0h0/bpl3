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

describe("Memory Operations", () => {
  it("should handle sizeof operator", () => {
    const source = `
      extern printf(fmt: string, ...);
      struct Point { x: i32, y: i32, }

      frame main() {
        printf("i32: %d\\n", sizeof<i32>());
        printf("i64: %d\\n", sizeof<i64>());
        printf("Point: %d\\n", sizeof<Point>());
        printf("ptr: %d\\n", sizeof<*i32>());
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Sizeof Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("i32: 4");
    expect(stdout).toContain("i64: 8");
    // Point: { i32, i32 } -> 4 + 4 = 8 bytes.
    expect(stdout).toContain("Point: 8");
    expect(stdout).toContain("ptr: 8"); // 64-bit pointers
  });

  it("should handle malloc and free", () => {
    const source = `
      extern printf(fmt: string, ...);
      extern malloc(size: i64) ret *void; # size_t is usually u64/i64
      extern free(ptr: *void);

      frame main() {
        local ptr: *void = malloc(8);
        if (ptr == nullptr) {
            printf("Malloc failed\\n");
            return;
        }

        # Cast to int pointer and write
        local int_ptr: *i32 = cast<*i32>(ptr);
        *int_ptr = 12345;

        printf("Value: %d\\n", *int_ptr);

        free(ptr);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Malloc Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Value: 12345\n");
  });

  it("should handle pointer casting", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local x: i64 = 0x123456789ABC;
        local ptr: *i64 = &x;

        # Cast to byte pointer to read first byte (little endian usually)
        local byte_ptr: *u8 = cast<*u8>(ptr);
        printf("Byte: %x\\n", *byte_ptr);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("PtrCast Stderr:", stderr);
    expect(exitCode).toBe(0);
    // 0xBC is the LSB
    expect(stdout).toContain("Byte: bc");
  });

  it("should handle nullptr pointer checks", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local ptr: *i32 = nullptr;
        if (ptr == nullptr) {
            printf("Is nullptr\\n");
        } else {
            printf("Not nullptr\\n");
        }
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("NullCheck Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Is nullptr\n");
  });
});
