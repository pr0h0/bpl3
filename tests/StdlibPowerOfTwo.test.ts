import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const inputs = [-2147483648, -1, 0, 1];
for (let bit = 1; bit <= 30; bit++) {
  const p = 2 ** bit;
  inputs.push(p - 1, p);
  if (bit < 30) inputs.push(p + 1);
}
const expected = inputs.map(x => {
  let power = 1;
  while (power < x) power *= 2;
  return String(power);
});

test("nextPowerOfTwo returns a positive power or rejects an unrepresentable result", () => {
  expectCorrectnessSuite([{
    name: "next-power-of-two-boundaries",
    validateLlvm: true,
    source: `
      import [Math] from "std/math.bpl";
      extern printf(fmt: string, ...);
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local values: int[${inputs.length}] = [${inputs.map(x => `cast<int>(${x})`).join(", ")}];
        loop (local i: int = 0; i < ${inputs.length}; i = i + 1) { printf("%d\\n", Math.nextPowerOfTwo(values[i])); }
        local caught: bool = false;
        try { Math.nextPowerOfTwo(1073741825); }
        catch (error: string) { caught = strcmp(error, "Math.nextPowerOfTwo result exceeds int") == 0; }
        if (!caught) { return 1; }
        caught = false;
        try { Math.nextPowerOfTwo(2147483647); }
        catch (error: string) { caught = strcmp(error, "Math.nextPowerOfTwo result exceeds int") == 0; }
        if (!caught) { return 2; }
        return 0;
      }`,
    expectedStdout: expected.join("\n") + "\n",
  }]);
}, 60000);
