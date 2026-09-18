import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// A variable declared in a loop's init belongs to the loop (R-LOOP scoping in
// docs/07-control-flow.md). Code generation did not restore a name the init
// shadowed, so the outer binding kept pointing at the loop's storage.
test("a loop init variable does not outlive the loop", () => {
  expectCorrectnessSuite([
    {
      name: "loop-init-scope",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";

      frame sliceStart(xs: int[]) ret *int {
        # Shadowing a slice parameter with an int used to leave the parameter
        # reading that int as a descriptor, which faulted on return.
        loop (local xs: int = 0; xs < 2; xs = xs + 1) {
          local _each: int = xs;
        }
        return &xs[0];
      }

      frame main() ret int {
        local i: int = 100;
        loop (local i: int = 0; i < 3; i = i + 1) {
          local _x: int = i;
        }

        local values: int[1] = [4];
        local total: int = 0;
        loop (local j: int = 0; j < 3; j = j + 1) {
          total = total + j;
        }

        printf("%d %d %d\\n", i, total, *sliceStart(values));
        return 0;
      }`,
      expectedStdout: "100 3 4\n",
    },
  ]);
}, 60000);
