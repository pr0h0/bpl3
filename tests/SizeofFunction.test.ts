import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Sizeof Function Types", () => {
  it("should report 8 bytes for FunctionType", async () => {
    const code = `
      extern printf(fmt: string, ...);
      extern exit(code: int);

      frame main() {
        local s: int = sizeof<Func<void>()>();
        printf("Size of Func: %d\\n", s);
        if (s != 8) {
          printf("FAIL: Expected 8, got %d\\n", s);
          exit(1);
        }
      }
    `;
    const { stdout, stderr, exitCode } = await runBpl(code, "sizeof_func");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Size of Func: 8");
  });

  it("should report 16 bytes for LambdaType", async () => {
    const code = `
      extern printf(fmt: string, ...);
      extern exit(code: int);

      frame main() {
        local s: int = sizeof<Lambda<void>()>();
        printf("Size of Lambda: %d\\n", s);
        if (s != 16) {
          printf("FAIL: Expected 16, got %d\\n", s);
          exit(1);
        }
      }
    `;
    const { stdout, stderr, exitCode } = await runBpl(code, "sizeof_lambda");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Size of Lambda: 16");
  });
});
