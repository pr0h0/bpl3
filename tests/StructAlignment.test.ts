import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Struct Alignment & Padding", () => {
  it("should align fields correctly", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      struct Mixed {
        a: u8,    # 1 byte
                  # 3 bytes padding (to align int)
        b: int,   # 4 bytes
        c: u8,    # 1 byte
                  # 7 bytes padding (to align u64)
        d: u64    # 8 bytes
      }
      # Alignment of struct is max(align(u8), align(int), align(u64)) = 8
      # Size must be multiple of alignment.
      # Offset a: 0
      # Offset b: 4
      # Offset c: 8
      # Offset d: 16
      # Size: 24

      frame main() ret int {
        printf("Size: %d\\n", sizeof(Mixed));
        
        local m: Mixed;
        m.a = cast<u8>(1);
        m.b = 2;
        m.c = cast<u8>(3);
        m.d = cast<u64>(4);
        
        printf("Values: %d %d %d %d\\n", cast<int>(m.a), m.b, cast<int>(m.c), cast<int>(m.d));
        return 0;
      }
    `;
    const result = runBpl(source, "struct_alignment");
    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Values: 1 2 3 4");
    // We expect standard C-like alignment
    expect(result.stdout).toContain("Size: 24");
  });
});
