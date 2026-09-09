import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("JSON distinguishes array storage from unrelated Array-prefixed structs", () => {
  expectCorrectnessSuite([
    {
      name: "JSON reflected array classification",
      validateLlvm: true,
      expectedStdout: '{"values": [1, 2]}\n{"name": "hello"}\n[3, 4]\n',
      source: `
      import [JSON] from "std/json.bpl";
      import [String] from "std/string.bpl";
      extern printf(fmt: string, ...);
      struct ArrayRecord { values: int[2] }
      struct Array_Record { name: string }
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local first: *ArrayRecord = JSON.parse<ArrayRecord>(${JSON.stringify('{"values":[1,2]}')});
        local second: *Array_Record = JSON.parse<Array_Record>(${JSON.stringify('{"name":"hello"}')});
        local third: *Array<int> = JSON.parse<Array<int>>("[3,4]");
        if ((first == nullptr) || (second == nullptr) || (third == nullptr)) { return 1; }
        local a: String = JSON.stringify<ArrayRecord>(first);
        local b: String = JSON.stringify<Array_Record>(second);
        local c: String = JSON.stringify<Array<int>>(third);
        printf("%s\\n%s\\n%s\\n", a.toString(), b.toString(), c.toString());
        a.destroy(); b.destroy(); c.destroy();
        JSON.free<ArrayRecord>(first);
        JSON.free<Array_Record>(second);
        JSON.free<Array<int>>(third);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
