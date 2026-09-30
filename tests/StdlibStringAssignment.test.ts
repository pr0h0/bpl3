import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("String assignment copies aliased text before releasing its buffer", () => {
  expectCorrectnessSuite([{
    name: "string-aliased-assignment",
    validateLlvm: true,
    source: `
      import [String] from "std/string.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local value: String = String.new("abcdef");
        value.assign(value.toString());
        if (strcmp(value.toString(), "abcdef") != 0) { return 1; }
        if (value.length != 6) { return 2; }
        value.assign(value.toString() + 2);
        if (strcmp(value.toString(), "cdef") != 0) { return 3; }
        if (value.length != 4) { return 4; }
        value.assign(value.toString() + value.length);
        if (strcmp(value.toString(), "") != 0) { return 5; }
        if (value.length != 0) { return 6; }
        value.assign("replacement");
        if (strcmp(value.toString(), "replacement") != 0) { return 7; }
        value.assign(nullptr);
        if (value.data != nullptr) { return 8; }
        if (value.length != 0) { return 9; }
        value.assign("reused");
        if (strcmp(value.toString(), "reused") != 0) { return 10; }
        value.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
