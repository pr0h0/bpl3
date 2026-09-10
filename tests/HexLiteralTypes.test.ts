import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("treats hexadecimal e/E digits as integers and preserves all 64 bits", () => {
  expectCorrectnessSuite([
    {
      name: "hexadecimal integer types",
      validateLlvm: true,
      expectedStdout: "7 239 1 76543210 fedcba98 76543210 fedcba98\n",
      source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        local small: int = 0xe / 2;
        local upper: int = 0XEF;
        local bits: u64 = cast<u64>(0xfedcba9876543210);
        local capital: u64 = cast<u64>(0XFEDCBA9876543210);
        printf("%d %d %d %x %x %x %x\\n", small, upper, sizeof(0xe) == sizeof<int>(),
          cast<u32>(bits), cast<u32>(bits >> cast<u64>(32)),
          cast<u32>(capital), cast<u32>(capital >> cast<u64>(32)));
        return 0;
      }
    `,
    },
  ]);
}, 60000);
