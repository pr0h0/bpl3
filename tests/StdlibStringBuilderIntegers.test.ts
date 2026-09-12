import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringBuilder appends every signed int boundary while growing and reusing its buffer", () => {
  expectCorrectnessSuite([
    {
      name: "string-builder-integer-boundaries",
      source: `
      import [StringBuilder] from "std/string_builder.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local builder: StringBuilder = StringBuilder.new(1);
        local values: int[7] = [cast<int>(0x80000000), -2147483647, -1, 0, 1, 2147483646, 2147483647];
        loop (local i: int = 0; i < 7; i = i + 1) {
          builder.append("["); builder.appendInt(values[i]); builder.append("]");
          printf("%s\\n", builder.buffer);
          builder.clear();
        }
        builder.destroy(); return 0;
      }
    `,
      expectedStdout:
        "[-2147483648]\n[-2147483647]\n[-1]\n[0]\n[1]\n[2147483646]\n[2147483647]\n",
      validateLlvm: true,
    },
  ]);
}, 60000);
