import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const valid = [
  "12345678-1234-4abc-9def-123456789abc",
  "1234567812344abc9def123456789abc",
  "12345678-1234-4ABC-9DEF-123456789ABC",
];
const invalid = [
  null,
  "",
  "12",
  "1234567812344abc9def123456789ab",
  "1234567812344abc9def123456789abcd",
  "12345678-1234-4abc-9def-123456789abcx",
  "12345678-1234-4abc-9def-123456789abc-",
  "12345678-1234-4abc-9def-123456789abz",
  "-1234567812344abc9def123456789abc",
  "1234567-81234-4abc-9def-123456789abc",
];
test("UUID checked parsing rejects incomplete or extra input and preserves output on failure", () => {
  expectCorrectnessSuite([
    {
      name: "uuid-checked-parsing",
      validateLlvm: true,
      source: `import [UUID] from "std/uuid.bpl"; import printf from "std/c.bpl"; frame main() ret int {
    local expected:UUID=UUID.fromString(${JSON.stringify(valid[0])});
    local output:UUID=expected;
    ${invalid
      .map(
        (
          s,
          i,
        ) => `if(UUID.tryFromString(${s === null ? "nullptr" : JSON.stringify(s)},&output) || output.equals(&expected)==false) {return ${i + 1};}
      local bad${i}:UUID=UUID.fromString(${s === null ? "nullptr" : JSON.stringify(s)}); if(bad${i}.isNil()==false) {return 20;}`,
      )
      .join("\n")}
    ${valid.map((s) => `if(UUID.tryFromString(${JSON.stringify(s)},&output)==false || output.equals(&expected)==false) {return 30;}`).join("\n")}
    if(UUID.tryFromString(${JSON.stringify(valid[0])},nullptr)) {return 31;}
    if(UUID.tryFromString("00000000-0000-0000-0000-000000000000",&output)==false || output.isNil()==false) {return 32;}
    printf("UUID parsing passed\\n");return 0;
  }`,
      expectedStdout: "UUID parsing passed\n",
    },
  ]);
}, 60000);
