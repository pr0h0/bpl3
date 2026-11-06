import { describe, test, expect } from "bun:test";
import { compileAndRun, compileAndRunFull } from "./helpers/compileAndRun";
describe("Nullptr Handling", () => {
  test("Nullptr assignment and check", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      struct Node {
        val: i32,
        next: *Node,
      }

      frame main() {
        local n: *Node = nullptr;

        if (n == nullptr) {
            printf("n is nullptr\\n");
        }

        if (n != nullptr) {
            printf("n is not nullptr\\n");
        }

        local n2: Node;
        n2.val = 10;
        n2.next = nullptr;

        if (n2.next == nullptr) {
            printf("n2.next is nullptr\\n");
        }
      }
    `);

    expect(output).toContain("n is nullptr");
    expect(output).toContain("n2.next is nullptr");
  });

  test("Nullptr dereference (should crash/error)", () => {
    // This test expects a runtime crash (exit code != 0)
    const source = `
      struct Node { val: i32, }
      frame main() {
        local n: *Node = nullptr;
        local x: i32 = n.val; # Dereference nullptr
      }
    `;

    // It must fail at runtime (or at compile time), never silently succeed.
    const result = compileAndRunFull(source);
    expect(result.exitCode, result.stdout).not.toBe(0);
  });
});
