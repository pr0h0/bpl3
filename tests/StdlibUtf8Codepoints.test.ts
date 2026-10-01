import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("UTF8 encodes scalar boundaries and replaces invalid codepoints", () => {
  expectCorrectnessSuite([{
    name: "utf8-scalar-encoding",
    validateLlvm: true,
    source: `
      import [UTF8] from "std/utf8.bpl";
      import [Array] from "std/array.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local values: u32[12] = [cast<u32>(0), cast<u32>(127), cast<u32>(128), cast<u32>(2047), cast<u32>(2048), cast<u32>(55295), cast<u32>(55296), cast<u32>(57343), cast<u32>(57344), cast<u32>(1114111), cast<u32>(1114112), cast<u32>(4294967295)];
        loop (local i: int = 0; i < 12; i = i + 1) {
          local bytes: u8[5] = [cast<u8>(0), cast<u8>(0), cast<u8>(0), cast<u8>(0), cast<u8>(0)];
          local n: int = UTF8.encodeCodepoint(values[i], &bytes[0]);
          printf("%d", n);
          loop (local j: int = 0; j < n; j = j + 1) { printf(" %u", cast<u32>(bytes[j])); }
          printf("\\n");
        }
        return 0;
      }`,
    expectedStdout: "1 0\n1 127\n2 194 128\n2 223 191\n3 224 160 128\n3 237 159 191\n3 239 191 189\n3 239 191 189\n3 238 128 128\n4 244 143 191 191\n3 239 191 189\n3 239 191 189\n",
  }]);
}, 60000);
