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

describe("Control Flow", () => {
  it("should handle break in nested loops", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local i: i32 = 0;
        loop (i < 3) {
          printf("Outer %d\\n", i);
          local j: i32 = 0;
          loop (j < 3) {
            if (j == 1) {
              break; # Should break inner loop
            }
            printf(" Inner %d\\n", j);
            j = j + 1;
          }
          i = i + 1;
        }
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Break Stderr:", stderr);
    expect(exitCode).toBe(0);
    // Outer 0, Inner 0, Outer 1, Inner 0, Outer 2, Inner 0
    expect(stdout).toContain("Outer 0");
    expect(stdout).toContain(" Inner 0");
    expect(stdout).not.toContain(" Inner 1");
    expect(stdout).toContain("Outer 1");
  });

  it("should handle continue in loops", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local i: i32 = 0;
        loop (i < 5) {
          i = i + 1;
          if (i == 3) {
            continue;
          }
          printf("%d\\n", i);
        }
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Continue Stderr:", stderr);
    expect(exitCode).toBe(0);
    // 1, 2, 4, 5
    expect(stdout).toContain("1");
    expect(stdout).toContain("2");
    expect(stdout).not.toContain("3");
    expect(stdout).toContain("4");
    expect(stdout).toContain("5");
  });

  it("should handle return from nested structures", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame check(val: i32) ret i32 {
        if (val > 10) {
          local i: i32 = 0;
          loop (i < 5) {
            if (i == 2) {
              return val * 2; # Return from inside loop inside if
            }
            i = i + 1;
          }
        }
        return 0;
      }

      frame main() {
        printf("%d\\n", check(20));
        printf("%d\\n", check(5));
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Return Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("40\n0\n");
  });

  it("should handle switch statements", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local i: i32 = 2;
        switch (i) {
          case 1: { printf("One\\n"); break; }
          case 2: { printf("Two\\n"); break; }
          case 3: { printf("Three\\n"); break; }
          default: { printf("Default\\n"); break; }
        }
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Switch Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Two\n");
  });

  it("should handle switch fallthrough (if supported) or lack thereof", () => {
    // BPL likely doesn't support fallthrough implicitly or explicit 'fallthrough' keyword?
    // Let's test if it executes only one case.
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local i: i32 = 1;
        switch (i) {
          case 1: { printf("A"); break; }
          case 2: { printf("B"); break; }
        }
        printf("\\n");
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("SwitchFallthrough Stderr:", stderr);
    expect(exitCode).toBe(0);
    // If no fallthrough, should be "A"
    // If fallthrough, "AB"
    expect(stdout).toBe("A\n");
  });
});
