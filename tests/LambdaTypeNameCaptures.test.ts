import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// BUG-483: `sizeof(uint)` inside a lambda resolved `uint` to its type alias
// and captured the alias like a variable, so the lambda loaded from an
// undefined `%uint_ptr`. Type names, aliases and structs capture nothing.
it("does not capture type names used in sizeof inside a lambda", () => {
  expectCorrectnessSuite([
    {
      name: "sizeof of type names in lambdas",
      validateLlvm: true,
      expectedStdout: "4162 4\n",
      source: `
      extern printf(fmt: string, ...);
      type Word = u16;
      struct Pt {
          x: int,
          y: long,
      }
      frame main() ret int {
          local f: Lambda<int>() = || ret int {
              return cast<int>(sizeof(Word)) + cast<int>(sizeof(Pt)) * 10 + cast<int>(sizeof(int)) * 1000;
          };
          local g: Lambda<u8>(int) = |_x: int| ret u8 {
              return cast<u8>(sizeof(uint));
          };
          printf("%d %d\\n", f(), cast<int>(g(1)));
          return 0;
      }
    `,
    },
  ]);
}, 60000);
