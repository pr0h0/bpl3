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

test("UTF8 decoding rejects malformed sequences and invalid positions", () => {
  expectCorrectnessSuite([{
    name: "utf8-codepoint-decoding",
    validateLlvm: true,
    source: `
      import [UTF8] from "std/utf8.bpl";
      import [Array] from "std/array.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local overlong: u8[3] = [cast<u8>(192), cast<u8>(128), cast<u8>(0)];
        local surrogate: u8[4] = [cast<u8>(237), cast<u8>(160), cast<u8>(128), cast<u8>(0)];
        local high: u8[5] = [cast<u8>(244), cast<u8>(144), cast<u8>(128), cast<u8>(128), cast<u8>(0)];
        local bad: u8[3] = [cast<u8>(194), cast<u8>(65), cast<u8>(0)];
        local short: u8[2] = [cast<u8>(240), cast<u8>(0)];
        printf("%u %u %u %u %u\\n",
          UTF8.decodeCodepoint(cast<string>(&overlong[0]), 0),
          UTF8.decodeCodepoint(cast<string>(&surrogate[0]), 0),
          UTF8.decodeCodepoint(cast<string>(&high[0]), 0),
          UTF8.decodeCodepoint(cast<string>(&bad[0]), 0),
          UTF8.decodeCodepoint(cast<string>(&short[0]), 0));
        if (UTF8.decodeCodepoint(cast<string>(&surrogate[0]), 0) != cast<u32>(65533)) { return 1; }
        printf("%u %u %u %u\\n", UTF8.decodeCodepoint(nullptr, 0),
          UTF8.decodeCodepoint("A", -1), UTF8.decodeCodepoint("A", 1),
          UTF8.decodeCodepoint("A", 2147483647));
        printf("%u %u %u %u\\n", UTF8.decodeCodepoint("Aé€😀", 0),
          UTF8.decodeCodepoint("Aé€😀", 1), UTF8.decodeCodepoint("Aé€😀", 3),
          UTF8.decodeCodepoint("Aé€😀", 6));
        local points: Array<u32> = UTF8.toCodepoints("Aé€😀");
        if (points.len() != 4) { return 2; }
        if ((points.get(0) != cast<u32>(65)) || (points.get(1) != cast<u32>(233))
            || (points.get(2) != cast<u32>(8364)) || (points.get(3) != cast<u32>(128512))) { return 3; }
        points.destroy();
        return 0;
      }`,
    expectedStdout: "65533 65533 65533 65533 65533\n65533 65533 65533 65533\n65 233 8364 128512\n",
  }]);
}, 60000);
