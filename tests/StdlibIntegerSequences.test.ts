import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const expected: string[] = [];
let product = 1n;
for (let n = 0; n <= 20; n++) {
  if (n > 0) product *= BigInt(n);
  expected.push(`factorial ${n} ${product}`);
}
let a = 0n, b = 1n;
for (let n = 0; n <= 92; n++) {
  expected.push(`fibonacci ${n} ${a}`);
  [a, b] = [b, a + b];
}

test("integer sequences match exact arithmetic and reject overflowing results", () => {
  expectCorrectnessSuite([{
    name: "integer-sequence-limits",
    validateLlvm: true,
    source: `
      import [Math] from "std/math.bpl";
      extern printf(fmt: string, ...);
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        loop (local n: int = 0; n <= 20; n = n + 1) { printf("factorial %d %ld\\n", n, Math.factorial(n)); }
        loop (local n: int = 0; n <= 92; n = n + 1) { printf("fibonacci %d %ld\\n", n, Math.fibonacci(n)); }
        local caught: bool = false;
        try { Math.factorial(21); }
        catch (error: string) { caught = strcmp(error, "Math.factorial result exceeds long") == 0; }
        if (!caught) { return 1; }
        caught = false;
        try { Math.fibonacci(93); }
        catch (error: string) { caught = strcmp(error, "Math.fibonacci result exceeds long") == 0; }
        if (!caught) { return 2; }
        caught = false;
        try { Math.factorial(2147483647); }
        catch (error: string) { caught = strcmp(error, "Math.factorial result exceeds long") == 0; }
        if (!caught) { return 3; }
        caught = false;
        try { Math.fibonacci(2147483647); }
        catch (error: string) { caught = strcmp(error, "Math.fibonacci result exceeds long") == 0; }
        if (!caught) { return 4; }
        if ((Math.factorial(-1) != cast<long>(1)) || (Math.fibonacci(-1) != cast<long>(0))) { return 5; }
        return 0;
      }`,
    expectedStdout: expected.join("\n") + "\n",
  }]);
}, 60000);
