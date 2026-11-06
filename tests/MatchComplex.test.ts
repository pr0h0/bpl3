import { describe, test, expect } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

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
