import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringUtils replacement terminates for empty patterns and keeps owned results", () => {
  expectCorrectnessSuite([{
    name: "string-utils-replacement",
    validateLlvm: true,
    source: `
      import [StringUtils] from "std/string_utils.bpl";
      import [String] from "std/string.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local empty: String = StringUtils.replace("abc", "", "");
        if (strcmp(empty.toString(), "abc") != 0) { return 1; }
        empty.destroy();
        local growing: String = StringUtils.replace("aaa", "a", "aa");
        if (strcmp(growing.toString(), "aaaaaa") != 0) { return 2; }
        growing.destroy();
        local overlapping: String = StringUtils.replace("aaaaa", "aa", "b");
        if (strcmp(overlapping.toString(), "bba") != 0) { return 3; }
        overlapping.destroy();
        local removed: String = StringUtils.replace("abac", "a", nullptr);
        if (strcmp(removed.toString(), "bc") != 0) { return 4; }
        removed.destroy();
        local original: String = String.new("sample");
        local copy: String = StringUtils.replace(original.toString(), nullptr, "x");
        original.destroy();
        if (strcmp(copy.toString(), "sample") != 0) { return 5; }
        copy.destroy();
        local blank: String = StringUtils.replace("", "a", "b");
        if (strcmp(blank.toString(), "") != 0) { return 6; }
        blank.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
