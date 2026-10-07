import { test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

for (const [name, source] of [
  [
    "fixed-callback-array",
    "frame bad(fs:Func<int>(int)[2]) ret int {return fs(1);}",
  ],
  ["callback-slice", "frame bad(fs:Func<int>(int)[]) ret int {return fs(1);}"],
  [
    "closure-array",
    "frame bad(fs:Lambda<int>(int)[2]) ret int {return fs(1);}",
  ],
  [
    "nested-callback-array",
    "frame bad(fs:Func<int>(int)[2][2]) ret int {return fs[0](1);}",
  ],
  [
    "generic-callback-array",
    "type Callback<T>=Func<T>(T); frame bad(fs:Callback<int>[2]) ret int {return fs(1);}",
  ],
]) {
  test(`rejects invocation of ${name} without selecting a callback`, () => {
    expectCheckDiagnostics([
      { name: name!, source: source!, code: "BPL_CALL_TARGET_NOT_CALLABLE" },
    ]);
  });
}
