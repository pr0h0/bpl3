import { describe, expect, it } from "bun:test";

import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

describe("Compiler correctness corpus", () => {
  it(
    "keeps representative runtime behavior stable across O0 and O3",
    () => {
      const results = expectCorrectnessSuite([
        {
          name: "recursive integer control flow",
          expectedStdout: "fact=120\n",
          validateLlvm: true,
          source: `
          extern printf(fmt: string, ...);

          frame fact(n: int) ret int {
            if (n <= 1) {
              return 1;
            }

            return n * fact(n - 1);
          }

          frame main() ret int {
            printf("fact=%d\\n", fact(5));
            return 0;
          }
        `,
        },
        {
          name: "enum match expression",
          expectedStdout: "color=3\n",
          validateLlvm: true,
          source: `
          extern printf(fmt: string, ...);

          enum Color { Red, Green, Blue }

          frame colorValue(c: Color) ret int {
            return match (c) {
              Color.Red => 1,
              Color.Green => 2,
              Color.Blue => 3,
            };
          }

          frame main() ret int {
            printf("color=%d\\n", colorValue(Color.Blue));
            return 0;
          }
        `,
        },
        {
          name: "lambda capture",
          expectedStdout: "lambda=17\n",
          source: `
          extern printf(fmt: string, ...);

          frame main() ret int {
            local base: int = 12;
            local addBase: Lambda<int>(int) = |x: int| ret int {
              return x + base;
            };

            printf("lambda=%d\\n", addBase(5));
            return 0;
          }
        `,
        },
        {
          name: "short-circuit and ternary",
          expectedStdout: "start ok choice=7\n",
          source: `
          extern printf(fmt: string, ...);

          frame marker(label: string) ret bool {
            printf("%s", label);
            return true;
          }

          frame main() ret int {
            printf("start ");

            if (false && marker("and ")) {
              printf("bad ");
            }

            if (true || marker("or ")) {
              printf("ok ");
            }

            local choice: int = true ? 7 : 9;
            printf("choice=%d\\n", choice);
            return 0;
          }
        `,
        },
        {
          name: "explicit generic function",
          expectedStdout: "generic=42\n",
          source: `
          extern printf(fmt: string, ...);

          frame id<T>(x: T) ret T {
            return x;
          }

          frame main() ret int {
            local value: int = id<int>(42);
            printf("generic=%d\\n", value);
            return 0;
          }
        `,
        },
        {
          name: "pointer-to-array row arithmetic",
          expectedStdout: "cell=42\n",
          validateLlvm: true,
          source: `
          extern printf(fmt: string, ...);

          type IntArray = int[3];

          frame readCell(rows: *IntArray, row: int, col: int) ret int {
            return (*(rows + row))[col];
          }

          frame main() ret int {
            local matrix: int[2][3];
            matrix[1][2] = 42;

            local rows: *IntArray = &matrix[0];
            printf("cell=%d\\n", readCell(rows, 1, 2));
            return 0;
          }
        `,
        },
      ]);

      expect(results.map((result) => result.name)).toEqual([
        "recursive integer control flow",
        "enum match expression",
        "lambda capture",
        "short-circuit and ternary",
        "explicit generic function",
        "pointer-to-array row arithmetic",
      ]);
    },
    60000,
  );

  it(
    "rejects representative invalid programs cleanly",
    () => {
      const failures = expectCleanFailureSuite([
        {
          name: "non-boolean if condition",
          expectedMessage: /boolean/i,
          source: `
          frame main() ret int {
            if (1) {
              return 1;
            }

            return 0;
          }
        `,
        },
        {
          name: "wrong function argument type",
          expectedMessage: "No matching function",
          source: `
          frame takesInt(value: int) ret int {
            return value;
          }

          frame main() ret int {
            return takesInt("not an int");
          }
        `,
        },
        {
          name: "same-scope redeclaration",
          expectedMessage: "already declared in this scope",
          source: `
          frame main() ret int {
            local value: int = 1;
            local value: int = 2;
            return value;
          }
        `,
        },
      ]);

      expect(failures).toHaveLength(3);
    },
    30000,
  );
});
