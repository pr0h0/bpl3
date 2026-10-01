import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringUtils search rejects invalid offsets and handles empty searches", () => {
  expectCorrectnessSuite([{
    name: "string-utils-search-bounds",
    validateLlvm: true,
    source: `
      import [StringUtils] from "std/string_utils.bpl";
      frame main() ret int {
        # The prefix is in the same literal allocation, so the old negative
        # search is reproducible without reading outside that allocation.
        local backing: string = "xyabc";
        if (StringUtils.findString(backing + 2, "xy", -2) != -1) { return 1; }
        if (StringUtils.findString("abc", "", 4) != -1) { return 2; }
        if (StringUtils.findString("abc", "", 2147483647) != -1) { return 3; }
        if (StringUtils.findString("abc", "", 3) != 3) { return 4; }
        if (StringUtils.findString("", "", 0) != 0) { return 5; }
        if (StringUtils.findString("abcabc", "abc", 1) != 3) { return 6; }
        if (StringUtils.findString("abc", "abcd", 0) != -1) { return 7; }
        if (StringUtils.findString(nullptr, "a", 0) != -1) { return 8; }
        if (StringUtils.findString("abc", nullptr, 0) != -1) { return 9; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
