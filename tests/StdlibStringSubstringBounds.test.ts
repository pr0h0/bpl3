import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// substring clamped its length with `start + len > this.length`, which
// overflows for a large length: the clamp was skipped, the copy length stayed
// enormous, and the allocation that followed failed and was written through.
test("String.substring clamps a length that would overflow the sum", () => {
  expectCorrectnessSuite([
    {
      name: "string-substring-bounds",
      validateLlvm: true,
      source: `
      import [String] from "std/string.bpl";
      import printf, strcmp from "std/c.bpl";

      frame check(actual: String, expected: string) ret bool {
        return strcmp(actual.toString(), expected) == 0;
      }

      frame main() ret int {
        local text: String = String.new("hello");

        if (!check(text.substring(0, 5), "hello")) { return 1; }
        if (!check(text.substring(0, 99), "hello")) { return 2; }
        if (!check(text.substring(2, 2), "ll")) { return 3; }
        if (!check(text.substring(4, 10), "o")) { return 4; }

        # A length that overflows when added to a non-zero start.
        if (!check(text.substring(0, 2147483647), "hello")) { return 5; }
        if (!check(text.substring(1, 2147483647), "ello")) { return 6; }
        if (!check(text.substring(4, 2147483647), "o")) { return 7; }
        if (text.substring(1, 2147483647).length != 4) { return 8; }

        # Out-of-range arguments stay empty rather than clamping to something.
        if (!check(text.substring(2, 0), "")) { return 9; }
        if (!check(text.substring(2, -5), "")) { return 10; }
        if (!check(text.substring(-1, 3), "")) { return 11; }
        if (!check(text.substring(5, 1), "")) { return 12; }

        local empty: String = String.new("");
        if (!check(empty.substring(0, 5), "")) { return 13; }

        printf("substring bounds hold\\n");
        return 0;
      }`,
      expectedStdout: "substring bounds hold\n",
    },
  ]);
}, 60000);
