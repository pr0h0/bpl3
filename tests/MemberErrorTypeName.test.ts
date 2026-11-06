import { describe, test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// BUG-479: a missing member on a primitive named the internal wrapper struct
// (`Int`, `Double`) instead of the type as other diagnostics show it.
describe("member-not-found diagnostics", () => {
  test("name primitives by their canonical type, and structs unchanged", () => {
    expectCheckDiagnostics(
      [
        ["int", "1", "i32"],
        ["float", "1.5", "double"],
        ["bool", "true", "bool"],
        ["char", "65", "i8"],
      ]
        .map(([type, value, shown]) => ({
          name: `member-on-${type}`,
          source: `frame main() ret int {\n    local v: ${type} = ${value};\n    v.nope();\n    return 0;\n}\n`,
          code: "BPL_MEMBER_NOT_FOUND",
          message: `Cannot access member 'nope' on type '${shown}'`,
        }))
        .concat([
          {
            name: "member-on-struct",
            source:
              "struct S {\n    x: int,\n}\n\nframe main() ret int {\n    local s: S = S { x: 1 };\n    return s.y;\n}\n",
            code: "BPL_MEMBER_NOT_FOUND",
            message: "Cannot access member 'y' on type 'S'",
          },
        ]),
    );
  }, 60000);
});
