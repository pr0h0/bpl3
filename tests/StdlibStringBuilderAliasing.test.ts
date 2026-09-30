import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringBuilder can append its own text and suffix across growth", () => {
  expectCorrectnessSuite([{
    name: "string-builder-self-append",
    validateLlvm: true,
    source: `
      import [StringBuilder] from "std/string_builder.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        loop (local mode: int = 0; mode < 2; mode = mode + 1) {
          local capacity: int = 64;
          if (mode == 0) { capacity = 5; }
          local full: StringBuilder = StringBuilder.new(capacity);
          full.append("abcd");
          full.append(full.toString());
          if (strcmp(full.toString(), "abcdabcd") != 0) { return 1; }
          if (full.len() != 8) { return 2; }
          full.destroy();

          local suffix: StringBuilder = StringBuilder.new(capacity);
          suffix.append("abcd");
          suffix.append(suffix.toString() + 1);
          if (strcmp(suffix.toString(), "abcdbcd") != 0) { return 3; }
          suffix.append(suffix.toString() + suffix.len());
          suffix.append(nullptr);
          if (strcmp(suffix.toString(), "abcdbcd") != 0) { return 4; }
          suffix.destroy();
        }
        local empty: StringBuilder = StringBuilder.new(0);
        empty.append(empty.toString());
        if (empty.len() != 0) { return 5; }
        empty.destroy();
        empty.append("reused");
        if (strcmp(empty.toString(), "reused") != 0) { return 6; }
        empty.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
