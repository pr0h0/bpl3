import { describe, expect, it } from "bun:test";

import {
  expectCleanCompilationFailure,
  expectSameBehaviorAtO0AndO3,
  expectValidLlvmAtOptimizations,
} from "./helpers/compilerCorrectness";

describe("Compiler correctness stability harness", () => {
  it("keeps scalar arithmetic and control-flow behavior stable across O0 and O3", () => {
    const result = expectSameBehaviorAtO0AndO3(`
      extern printf(fmt: string, ...);

      frame score(limit: i32) ret i32 {
        local total: i32 = 0;
        local i: i32 = 0;

        loop (i < limit) {
          if ((i % 2) == 0) {
            total = total + (i * 3);
          } else {
            total = total - i;
          }
          i = i + 1;
        }

        return total;
      }

      frame main() ret i32 {
        printf("score=%d\\n", score(12));
        return 0;
      }
    `);

    expect(result.stdout).toBe("score=54\n");
  });

  it("keeps aggregate and pointer mutation behavior stable across O0 and O3", () => {
    const result = expectSameBehaviorAtO0AndO3(`
      extern printf(fmt: string, ...);

      struct Pair {
        left: i32,
        right: i32,
      }

      frame bump(pair: *Pair, index: i32) ret void {
        pair.left = pair.left + index;
        pair.right = pair.right + (index * 2);
      }

      frame main() ret i32 {
        local p: Pair = Pair { left: 2, right: 5 };
        local values: i32[4] = [1, 2, 3, 4];
        local i: i32 = 0;

        loop (i < 4) {
          bump(&p, values[i]);
          i = i + 1;
        }

        printf("pair=%d,%d\\n", p.left, p.right);
        return 0;
      }
    `);

    expect(result.stdout).toBe("pair=12,25\n");
  });

  it("emits clang-accepted LLVM IR at O0 and O3 for runtime programs", () => {
    expectValidLlvmAtOptimizations(`
      extern printf(fmt: string, ...);

      frame choose(value: i32) ret i32 {
        switch (value) {
          case 1:
            return 10;
          case 2:
            return 20;
          default:
            return 30;
        }
      }

      frame main() ret i32 {
        printf("choice=%d\\n", choose(2));
        return 0;
      }
    `);
  });

  it("rejects invalid source cleanly instead of throwing internal exceptions", () => {
    const failure = expectCleanCompilationFailure(`
      frame takes_int(value: i32) ret i32 {
        return value;
      }

      frame main() ret i32 {
        return takes_int("not an int");
      }
    `);

    expect(failure.stderr + failure.stdout).toContain("No matching function");
  });
});
