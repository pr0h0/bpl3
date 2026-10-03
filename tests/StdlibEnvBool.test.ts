import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases: Array<[string, boolean | null]> = [
  ["1", true], ["0", false], ["true", true], ["FALSE", false], ["TrUe", true],
  ["YeS", true], ["nO", false], ["On", true], ["oFf", false],
  ["", null], ["10", null], ["01", null], ["1yes", null], ["0false", null],
  ["truex", null], ["falsex", null], ["t", null], ["tr", null], ["tru", null],
  ["f", null], ["fa", null], ["fal", null], ["fals", null], ["o", null],
  ["of", null], ["y", null], ["ye", null], ["n", null], [" true", null],
];
test("Env.getBool accepts complete boolean spellings and otherwise preserves defaults", () => {
  expectCorrectnessSuite([{
    name: "env-bool-parsing",
    validateLlvm: true,
    source: `
      import [Env] from "std/env.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local name: string = "BPL_TEST_ENV_BOOL_BOUNDARIES";
        ${cases.map(([value]) => `if (!Env.set(name, ${JSON.stringify(value)})) { return 1; } printf("%d %d\\n", cast<int>(Env.getBool(name, false)), cast<int>(Env.getBool(name, true)));`).join("\n")}
        if (!Env.unset(name)) { return 2; }
        if (Env.getBool(name, false) || !Env.getBool(name, true)) { return 3; }
        return 0;
      }`,
    expectedStdout: cases.map(([, value]) => value === null ? "0 1" : value ? "1 1" : "0 0").join("\n") + "\n",
  }]);
}, 60000);
