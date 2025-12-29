import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Complex Nested Types", () => {
  it("should handle array of structs with arrays", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      struct Inner {
        data: int[3]
      }
      
      struct Outer {
        inners: Inner[2]
      }
      
      frame main() ret int {
        local o: Outer;
        
        # Initialize
        o.inners[0].data[0] = 10;
        o.inners[0].data[1] = 11;
        o.inners[0].data[2] = 12;
        
        o.inners[1].data[0] = 20;
        o.inners[1].data[1] = 21;
        o.inners[1].data[2] = 22;
        
        printf("0,0: %d\\n", o.inners[0].data[0]);
        printf("1,2: %d\\n", o.inners[1].data[2]);
        
        return 0;
      }
    `;
    const result = runBpl(source, "nested_arrays_structs");
    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0,0: 10");
    expect(result.stdout).toContain("1,2: 22");
  });
});
