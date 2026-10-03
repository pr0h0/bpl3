import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases: Array<[string, number]> = [
  ["", 73], ["+", 73], ["-", 73], ["0", 0], ["-0", 0], ["+42", 42],
  ["-42", -42], ["0000012", 12], ["2147483647", 2147483647],
  ["-2147483648", -2147483648], ["2147483648", 73], ["-2147483649", 73],
  ["4294967296", 73], ["999999999999999999999999999999", 73],
  ["-999999999999999999999999999999", 73], ["12x", 73], [" 12", 73], ["12 ", 73],
];
test("Env.getInt requires a complete representable signed decimal", () => {
  expectCorrectnessSuite([{
    name: "env-int-parsing",
    validateLlvm: true,
    source: `
      import [Env] from "std/env.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local name: string = "BPL_TEST_ENV_INT_BOUNDARIES";
        ${cases.map(([value]) => `if (!Env.set(name, ${JSON.stringify(value)})) { return 1; } printf("%d\\n", Env.getInt(name, 73));`).join("\n")}
        if (!Env.unset(name)) { return 2; }
        if (Env.getInt(name, 73) != 73) { return 3; }
        return 0;
      }`,
    expectedStdout: cases.map(([, value]) => value).join("\n") + "\n",
  }]);
}, 60000);
