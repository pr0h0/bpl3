import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";
import { withTempBplSource } from "./helpers/tempBplSource";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function runBPL(sourceCode: string) {
  return withTempBplSource(sourceCode, (tempFile) => {
    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  });
}

describe("Function Pointers", () => {
  it("should handle basic function pointers", () => {
    const source = `
      extern printf(fmt: string, ...);

      type Callback = Func<void>(i32);

      frame my_callback(val: i32) {
          printf("Callback: %d\\n", val);
      }

      frame caller(cb: Callback, val: i32) {
          cb(val);
      }

      frame main() {
          caller(my_callback, 123);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("FuncPtr Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Callback: 123\n");
  });

  it("should handle function pointers in structs", () => {
    const source = `
      extern printf(fmt: string, ...);

      type Op = Func<i32>(i32, i32);

      struct Calculator {
          op: Op,
      }

      frame add(a: i32, b: i32) ret i32 {
          return a + b;
      }

      frame main() {
          local calc: Calculator;
          calc.op = add;

          local f: Op = calc.op;
          printf("Result: %d\\n", f(10, 20));
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("StructFuncPtr Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Result: 30\n");
  });
});
