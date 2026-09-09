import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("parses and frees a fixed array as a JSON root value", () => {
  expectCorrectnessSuite([{
    name: "JSON fixed array root",
    validateLlvm: true,
    expectedStdout: "11 22\n",
    source: `
      import [JSON] from "std/json.bpl";
      extern printf(fmt: string, ...);
      type Pair = int[2];
      frame main() ret int {
        local values: *Pair = JSON.parse<int[2]>("[11,22]");
        if (values == nullptr) { return 1; }
        printf("%d %d\\n", values[0], values[1]);
        JSON.free<int[2]>(values);
        return 0;
      }
    `,
  }]);
}, 60000);
