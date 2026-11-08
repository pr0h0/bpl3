import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// BUG-485: `extern printf(fmt: string, ...);` was called as `void`, which
// does not match C's `int printf` (hosted WebAssembly traps on that).
// spec: R-EXTERN-8
it("gives known C externs without a return type their int result", () => {
  expectCorrectnessSuite([
    {
      name: "known C extern return types",
      validateLlvm: true,
      expectedStdout: "ab\nxyz\n3 4\n",
      source: `
      extern printf(fmt: string, ...);
      extern puts(s: string);
      frame main() ret int {
          local n: int = printf("ab\\n");
          local m: int = puts("xyz");
          printf("%d %d\\n", n, m >= 0 ? 4 : 0);
          return 0;
      }
    `,
    },
  ]);
}, 60000);
