import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const codec of ["Base64", "Hex"]) {
  test(`${codec} rejects input lengths that cannot fit its scan indices`, () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-codec-length-"));
    try {
      // Replace only strlen in a temporary copy of the implementation. Lengths
      // that wrap negative, zero, or small positive must all be rejected before
      // accessing the input. The INT_MAX control is immediately invalid text.
      const source = readFileSync(resolve(`lib/${codec.toLowerCase()}.bpl`), "utf8")
        .replace(/\bstrlen\b/g, "codecTestLength")
        .replace("extern codecTestLength(str: string) ret long;", `
          frame codecTestLength(str: string) ret long {
            local first: u8 = *cast<*u8>(str);
            if (first == cast<u8>(65)) { return cast<long>(2147483648); }
            if (first == cast<u8>(66)) { return cast<long>(4294967296); }
            if (first == cast<u8>(67)) { return cast<long>(4294967300); }
            return cast<long>(2147483647);
          }`);
      const module = join(dir, "codec.bpl");
      writeFileSync(module, source);
      expectCorrectnessSuite([{
        name: `${codec.toLowerCase()}-scan-length-bounds`,
        validateLlvm: true,
        source: `
          import [${codec}] from "${module}";
          frame main() ret int {
            local inputs: string[4] = ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC", "!!!!!!!!"];
            loop (local i: int = 0; i < 4; i = i + 1) {
              if (${codec}.decodedLength(inputs[i]) != -1) { return 1; }
              if (${codec}.isValid(inputs[i])) { return 2; }
              local output: u8[8] = [cast<u8>(42), cast<u8>(42), cast<u8>(42), cast<u8>(42), cast<u8>(42), cast<u8>(42), cast<u8>(42), cast<u8>(42)];
              if (${codec}.decode(inputs[i], &output[0]) != -1) { return 3; }
              loop (local j: int = 0; j < 8; j = j + 1) {
                if (output[j] != cast<u8>(42)) { return 4; }
              }
              if (${codec}.decodeToString(inputs[i]) != nullptr) { return 5; }
            }
            return 0;
          }`,
        expectedStdout: "",
      }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
}
