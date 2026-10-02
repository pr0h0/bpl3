import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const inputs = [-2147483648, -9, -1, 0, 1, 2, 3, 4, 5, 6, 1610612731, 1610612732, 1610612733];
test("Base64 measures encoded lengths without overflowing its int result", () => {
  expectCorrectnessSuite([{
    name: "base64-encoded-length-limits",
    validateLlvm: true,
    source: `
      import [Base64] from "std/base64.bpl";
      extern printf(fmt: string, ...);
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local inputs: int[${inputs.length}] = [${inputs.map(n => `cast<int>(${n})`).join(", ")}];
        loop (local i: int = 0; i < ${inputs.length}; i = i + 1) {
          printf("%d\\n", Base64.encodedLength(inputs[i]));
        }
        local caught: bool = false;
        try { Base64.encodedLength(1610612734); }
        catch (error: string) { caught = strcmp(error, "Base64 encoded length exceeds int") == 0; }
        if (!caught) { return 1; }
        caught = false;
        try { Base64.encodedLength(2147483647); }
        catch (error: string) { caught = strcmp(error, "Base64 encoded length exceeds int") == 0; }
        if (!caught) { return 2; }
        return 0;
      }`,
    expectedStdout: inputs.map(n => n <= 0 ? "0" : String(((BigInt(n) + 2n) / 3n) * 4n)).join("\n") + "\n",
  }]);
}, 60000);
