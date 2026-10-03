import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Env queries consistently treat null names as missing", () => {
  expectCorrectnessSuite([{
    name: "env-null-names",
    validateLlvm: true,
    source: `
      import [Env] from "std/env.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        if (Env.get(nullptr) != nullptr) { return 1; }
        if (strcmp(Env.getOr(nullptr, "fallback"), "fallback") != 0) { return 2; }
        if (Env.getOr(nullptr, nullptr) != nullptr) { return 3; }
        if (Env.has(nullptr) || Env.hasValue(nullptr)) { return 4; }
        if (Env.getInt(nullptr, 73) != 73) { return 5; }
        if (!Env.getBool(nullptr, true) || Env.getBool(nullptr, false)) { return 6; }
        if (Env.set(nullptr, "value") || Env.setIfAbsent(nullptr, "value") || Env.unset(nullptr)) { return 7; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
