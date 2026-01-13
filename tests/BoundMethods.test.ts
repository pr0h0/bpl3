import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Bound Methods (BUG-088)", () => {
  it("should support assigning a bound method to a lambda variable", () => {
    const code = `
      extern printf(fmt: string, ...) ret int;
      struct Counter {
        count: int,
        frame increment(this: *Counter) {
          this.count = this.count + 1;
        }
      }

      frame main() {
        local c: Counter = Counter { count: 10 };
        local inc: Lambda<void>() = c.increment;
        
        inc();
        inc();
        
        printf("Count: %d", c.count);
      }
    `;
    const result = runBpl(code, "bound_method_test");
    expect(result.stdout).toContain("Count: 12");
  });
});
