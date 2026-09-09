import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("forwards explicit generic method arguments without inferring them twice", () => {
  expectCorrectnessSuite([
    {
      name: "generic method forwarding",
      validateLlvm: true,
      expectedStdout: "42 7\n",
      source: `
      import [JSON] from "std/json.bpl";
      extern printf(fmt: string, ...);
      struct Methods {
        frame get<T>(value: *T) ret T { return *value; }
      }
      frame forward<T>(value: *T) ret T {
        return Methods.get<T>(value);
      }
      frame parseAndFree<T>(input: string) ret T {
        local value: *T = JSON.parse<T>(input);
        local result: T = *value;
        JSON.free<T>(value);
        return result;
      }
      frame main() ret int {
        local n: int = 7;
        local p: *int = &n;
        local pp: **int = &p;
        local forwarded: *int = forward<*int>(pp);
        printf("%d %d\\n", parseAndFree<int>("42"), *forwarded);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
