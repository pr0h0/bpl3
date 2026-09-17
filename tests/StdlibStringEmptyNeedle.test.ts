import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// The empty string is contained in every string, at position 0, and every
// string both starts and ends with it. `includes` reported the opposite while
// `indexOf`, `startsWith`, and `endsWith` in the same file agreed with the
// convention, so the four disagreed about the same question.
test("String search reports the empty needle consistently", () => {
  expectCorrectnessSuite([
    {
      name: "string-empty-needle",
      validateLlvm: true,
      source: `
      import [String] from "std/string.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local text: String = String.new("hello");
        local empty: String = String.new("");

        # includes agrees with indexOf: found, at the start.
        if (!text.includes("")) { return 1; }
        if (text.indexOf("") != 0) { return 2; }
        if (!text.startsWith("")) { return 3; }
        if (!text.endsWith("")) { return 4; }
        if (text.lastIndexOf("") != 5) { return 5; }

        # The empty string contains the empty string.
        if (!empty.includes("")) { return 6; }
        if (empty.indexOf("") != 0) { return 7; }

        # A non-empty needle is unaffected.
        if (!text.includes("ll")) { return 8; }
        if (text.includes("zz")) { return 9; }
        if (empty.includes("z")) { return 10; }

        # A null needle is still rejected rather than treated as empty.
        if (text.includes(nullptr)) { return 11; }

        printf("empty needle consistent\\n");
        return 0;
      }`,
      expectedStdout: "empty needle consistent\n",
    },
  ]);
}, 60000);
