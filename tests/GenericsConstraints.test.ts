import { describe, test, expect } from "bun:test";
import { compileAndRun, compileAndRunFull } from "./helpers/compileAndRun";
describe("Generics Constraints", () => {
  test("Basic constraint enforcement", () => {
    // Should fail because String does not implement Number
    const result = compileAndRunFull(`
      spec Number {
        frame toInt(this: *Number) ret i32;
      }

      struct Container<T: Number> {
        value: T,
      }

      struct MyString {
        data: *i8,
      }

      frame main() {
        local c: Container<MyString>;
      }
    `);

    // We expect an error about constraint not satisfied
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("constraint");
  });

  test("Valid constraint usage", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      spec Printable {
        frame print(this: *Printable);
      }

      struct Wrapper<T: Printable> {
        item: T,
        frame display(this: *Wrapper<T>) {
            this.item.print();
        }
      }

      struct MyInt : Printable {
        val: i32,
        frame print(this: *MyInt) {
            printf("MyInt: %d\\n", this.val);
        }
      }

      frame main() {
        local i: MyInt;
        i.val = 42;

        local w: Wrapper<MyInt>;
        w.item = i;
        w.display();
      }
    `);

    expect(output).toContain("MyInt: 42");
  });
});
