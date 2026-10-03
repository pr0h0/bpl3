import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Array bounds errors include their message and preserve index metadata", () => {
  const operations = ["values.get(INDEX)", "values.getRef(INDEX)", "values.set(INDEX, 99)", "values.removeAt(INDEX)"];
  expectCorrectnessSuite([{
    name: "array-bounds-error-messages",
    validateLlvm: true,
    source: `
      import [Array] from "std/array.bpl";
      import [IndexOutOfBoundsError] from "std/errors.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local values: Array<int> = Array<int>.new(4);
        values.push(10); values.push(20);
        ${operations.flatMap((operation, i) => [-1, 2].map((index, j) => `
          local caught${i}_${j}: bool = false;
          try { ${operation.replace("INDEX", String(index))}; }
          catch (error: IndexOutOfBoundsError) {
            caught${i}_${j} = error.message != nullptr && strcmp(error.message, "Index out of bounds") == 0 && error.index == ${index} && error.size == 2;
          }
          if (!caught${i}_${j}) { return 1; }
        `)).join("\n")}
        if (values.len() != 2 || values.get(0) != 10 || values.get(1) != 20) { return 2; }
        values.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
