import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const cases = [
  ["a", "a", "aa", "aa"],
  ["aaaa", "aa", "a", "aa"],
  ["aaa", "aa", "b", "ba"],
  ["aaa", "a", "a", "aaa"],
  ["banana", "an", "", "ba"],
  ["abc", "", "x", "abc"],
  ["abc", "longer", "x", "abc"],
  ["", "x", "y", ""],
  ["éé", "é", "界", "界界"],
  ["abab", "ab", null, ""],
  ["abc", null, "x", "abc"],
] as const;
test("String.replaceAll terminates, preserves its source, and replaces original non-overlapping matches", () => {
  expectCorrectnessSuite([
    {
      name: "string-replace-all",
      validateLlvm: true,
      source: `
      import [String] from "std/string.bpl";
      import printf, strcmp from "std/c.bpl";
      frame main() ret int {
        ${cases
          .map(
            ([input, old, replacement], i) => `
          local input${i}: String = String.new(${JSON.stringify(input)});
          local result${i}: String = input${i}.replaceAll(${old === null ? "nullptr" : JSON.stringify(old)}, ${replacement === null ? "nullptr" : JSON.stringify(replacement)});
          if (strcmp(input${i}.toString(), ${JSON.stringify(input)}) != 0) { return 1; }
          input${i}.destroy(); printf("[%s]\\n",result${i}.toString()); result${i}.destroy();
        `,
          )
          .join("\n")}
        return 0;
      }
    `,
      expectedStdout: cases.map((c) => `[${c[3]}]\n`).join(""),
    },
  ]);
}, 60000);
