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
  fs.writeFileSync(tempFile, sourceCode);

  try {
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

describe("Complex Match Expressions", () => {
  test("Match with guards on Enum", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      enum Status {
        Ok,
        Fail
      }

      frame main() {
        local s: Status = Status.Ok;
        local x: i32 = 10;

        match (s) {
            Status.Ok if (x > 5) => {
                printf("Matched Ok with guard\\n");
            },
            Status.Ok => {
                printf("Matched Ok without guard\\n");
            },
            _ => {
                printf("Default\\n");
            }
        };

        local s2: Status = Status.Fail;
        match (s2) {
            Status.Fail if (x < 5) => {
                printf("Should not match\\n");
            },
            Status.Fail => {
                printf("Matched Fail fallback\\n");
            },
            _ => {
                printf("Default\\n");
            }
        };
      }
    `);

    expect(output).toContain("Matched Ok with guard");
    expect(output).toContain("Matched Fail fallback");
  });

  test("Match with Enum Data (Tagged Union)", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      enum Result {
        Val(i32),
        Err(i32)
      }

      frame main() {
        local r: Result = Result.Val(42);

        match (r) {
            Result.Val(v) => {
                printf("Got Value: %d\\n", v);
            },
            Result.Err(e) => {
                printf("Got Error: %d\\n", e);
            }
        };

        local e: Result = Result.Err(500);
        match (e) {
            Result.Val(v) => {
                printf("Got Value: %d\\n", v);
            },
            Result.Err(code) => {
                printf("Got Error: %d\\n", code);
            }
        };
      }
    `);
    expect(output).toContain("Got Value: 42");
    expect(output).toContain("Got Error: 500");
  });
});
