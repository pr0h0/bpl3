import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("returns owned strings for empty, null, and ordinary encoding inputs", () => {
  const calls = [
    "Hex.encode(nullptr, 0)",
    "Hex.encode(nullptr, 3)",
    "Hex.encodeUpper(nullptr, 0)",
    "Hex.encodeString(nullptr)",
    'Hex.encodeString("")',
    "Hex.decodeToString(nullptr)",
    'Hex.decodeToString("")',
    "Base64.encode(nullptr, 0)",
    "Base64.encodeString(nullptr)",
    'Base64.encodeString("")',
    "Base64.decodeToString(nullptr)",
    'Base64.decodeToString("")',
  ];
  expectCorrectnessSuite([
    {
      name: "encoding ownership",
      validateLlvm: true,
      expectedStdout: "encoding ok\n",
      source: `
      import [Hex] from "std/hex.bpl";
      import [Base64] from "std/base64.bpl";
      extern free(ptr: *void);
      extern strcmp(a: string, b: string) ret int;
      extern printf(fmt: string, ...);
      frame main() ret int {
        ${calls
          .map(
            (call, i) => `
          local s${i}: string = ${call};
          if (s${i} == nullptr || strcmp(s${i}, "") != 0) { return 1; }
          free(cast<*void>(s${i}));
        `,
          )
          .join("\n")}
        local h: string = Hex.encodeString("hello");
        local hd: string = Hex.decodeToString(h);
        local b: string = Base64.encodeString("hello");
        local bd: string = Base64.decodeToString(b);
        if (strcmp(h, "68656c6c6f") != 0 || strcmp(hd, "hello") != 0) { return 2; }
        if (strcmp(b, "aGVsbG8=") != 0 || strcmp(bd, "hello") != 0) { return 3; }
        free(cast<*void>(h)); free(cast<*void>(hd));
        free(cast<*void>(b)); free(cast<*void>(bd));
        printf("encoding ok\\n"); return 0;
      }
    `,
    },
  ]);
}, 60000);
