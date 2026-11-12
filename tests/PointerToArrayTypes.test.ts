import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

describe("pointers to arrays and arrays of pointers", () => {
  // spec: R-ARR-4
  test("a pointer to an array is not an array of pointers", () => {
    expectCheckDiagnostics([
      {
        name: "address-of-array-to-array-of-pointers",
        source: `frame main() { local m: int[2] = [1, 2]; local q: *int[2] = &m; q; }`,
        message: "cannot assign (*i32)[2] to *i32[2]",
      },
    ]);
  });

  // spec: R-ARR-4
  test("both layouts work when spelled correctly", () => {
    expectCorrectnessSuite([
      {
        name: "pointer-array-layouts",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
type Row = int[2];
frame setRow(p: *Row) { (*p)[1] = 55; }
frame first(ps: *int[2]) ret int { return *ps[0] + *ps[1]; }
frame main() ret int {
    local m: int[2] = [1, 2];
    setRow(&m);
    local ps: *int[2] = [&m[0], &m[1]];
    printf("%d %d\\n", m[1], first(ps));
    return 0;
}
`,
        expectedStdout: "55 56\n",
      },
    ]);
  });
});
