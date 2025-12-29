import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Bitwise Edge Cases", () => {
  it("should handle shift operations", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame main() ret int {
        local x: int = 1;
        printf("1 << 0 = %d\\n", x << 0);
        printf("1 << 31 = %d\\n", x << 31);
        
        local y: int = -1;
        # Arithmetic shift right usually for signed
        printf("-1 >> 1 = %d\\n", y >> 1);
        
        local z: uint = cast<uint>(-1); # Max uint
        # Logical shift right for unsigned
        printf("MaxUint >> 1 = %u\\n", z >> 1);
        
        return 0;
      }
    `;
    const result = runBpl(source, "bitwise_edge");
    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1 << 0 = 1");
    expect(result.stdout).toContain("1 << 31 = -2147483648");
    expect(result.stdout).toContain("-1 >> 1 = -1");
    expect(result.stdout).toContain("MaxUint >> 1 = 2147483647");
  });
});
