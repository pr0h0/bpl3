import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("reflects concrete generic struct methods with callable signatures", () => {
  expectCorrectnessSuite([
    {
      name: "generic struct method reflection",
      validateLlvm: true,
      expectedStdout: "Array_i32 2 2\n",
      source: `
      import [Array] from "std/array.bpl";
      import [TypeInfo], [MethodInfo] from "std/reflection.bpl";
      extern printf(fmt: string, ...);
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local info: *TypeInfo = typeof<Array<int>>();
        local values: Array<int> = Array<int>.new(2);
        values.push(11); values.push(22);
        local reflectedLength: int = -1;
        loop (local i: int = 0; i < info.num_methods; i = i + 1) {
          local method: MethodInfo = info.methods[i];
          if (strcmp(method.name, "map") == 0) { return 1; }
          if (strcmp(method.name, "len") == 0) {
            local getLength: Func<int>(*Array<int>) = cast<Func<int>(*Array<int>)>(method.func_ptr);
            reflectedLength = getLength(&values);
          }
        }
        printf("%s %d %d\\n", info.name, values.len(), reflectedLength);
        values.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 60000);
