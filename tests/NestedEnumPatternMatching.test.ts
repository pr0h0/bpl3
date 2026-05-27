import { describe, expect, it } from "bun:test";

import { compileAndRun } from "./helpers";

describe("Nested enum pattern matching", () => {
  it("matches nested enum tuple payloads and binds inner values", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;
      import [Option] from "std/option.bpl";
      import [Result] from "std/result.bpl";

      frame describe(value: Option<Result<int, int>>) ret int {
        return match (value) {
          Option.Some(Result.Ok(x)) => x,
          Option.Some(Result.Err(e)) => -e,
          Option.None => 0,
        };
      }

      frame main() ret int {
        printf("%d\\n", describe(Option<Result<int, int>>.Some(Result<int, int>.Ok(42))));
        printf("%d\\n", describe(Option<Result<int, int>>.Some(Result<int, int>.Err(7))));
        printf("%d\\n", describe(Option<Result<int, int>>.None));
        return 0;
      }
    `);

    expect(output).toBe("42\n-7\n0\n");
  });

  it("matches literals and wildcards inside enum tuple payloads", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      enum Pair {
        Both(int, int),
        Empty,
      }

      frame classify(value: Pair) ret int {
        return match (value) {
          Pair.Both(0, 0) => 10,
          Pair.Both(1, _) => 20,
          Pair.Both(_, 2) => 30,
          Pair.Both(x, y) => x + y,
          Pair.Empty => -1,
        };
      }

      frame main() ret int {
        printf("%d\\n", classify(Pair.Both(0, 0)));
        printf("%d\\n", classify(Pair.Both(1, 9)));
        printf("%d\\n", classify(Pair.Both(8, 2)));
        printf("%d\\n", classify(Pair.Both(3, 4)));
        printf("%d\\n", classify(Pair.Empty));
        return 0;
      }
    `);

    expect(output).toBe("10\n20\n30\n7\n-1\n");
  });
});
