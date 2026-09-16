import { test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-ARR-3, R-ARR-8
test("integer widening cannot bypass array argument shape and storage checks", () => {
  expectCheckDiagnostics(
    [
      ["row-width", "int[3][3]", "int[][2]", "value[0][0]"],
      ["array-length", "int[3]", "int[2]", "value[0]"],
      ["element-width", "int[3]", "long[]", "cast<int>(value[0])"],
      ["scalar-to-array", "int", "int[2]", "value[0]"],
      ["array-to-scalar", "int[3]", "int", "value"],
    ].map(([name, source, target, result]) => ({
      name: `array-argument-${name}`,
      source: `frame read(value:${target}) ret int {return ${result};}
frame main() ret int {local value:${source};return read(value);}`,
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
    })),
  );
});

test("array shape overload selection still permits scalar integer widening", () => {
  expectCorrectnessSuite([
    {
      name: "array-overload-and-scalar-widening",
      source: `frame read(value:int[2]) ret int {return value[1];}
frame read(value:int[3]) ret int {return value[2];}
frame widen(value:long) ret long {return value;}
frame main() ret int {
 local a:int[2];a[1]=20;local b:int[3];b[2]=22;
 return cast<int>(widen(read(a)+read(b)))-42;
}`,
      validateLlvm: true,
      expectedStdout: "",
    },
  ]);
}, 60000);
