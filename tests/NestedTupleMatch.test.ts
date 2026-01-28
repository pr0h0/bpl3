/**
 * Tests for nested tuple pattern matching
 */
import { describe, test, expect } from "bun:test";
import { compileAndRun, compilesSuccessfully } from "./helpers/compileAndRun";

describe("Nested Tuple Pattern Matching", () => {
  test("simple nested tuple destructuring", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local nested: ((int, int), int) = ((1, 2), 3);
        
        match (nested) {
          ((a, b), c) => {
            printf("a=%d, b=%d, c=%d\\n", a, b, c);
          }
        }
      }
    `);
    expect(output).toContain("a=1, b=2, c=3");
  });

  test("nested tuple with literal matching", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local nested: ((int, int), int) = ((1, 2), 3);
        
        match (nested) {
          ((1, 2), 3) => printf("matched exact\\n"),
          _ => printf("no match\\n"),
        }
      }
    `);
    expect(output).toContain("matched exact");
  });

  test("nested tuple with mixed patterns", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local nested: ((int, int), int) = ((5, 10), 15);
        
        match (nested) {
          ((1, _), _) => printf("first is 1\\n"),
          ((x, 10), y) => printf("x=%d, y=%d\\n", x, y),
          _ => printf("no match\\n"),
        }
      }
    `);
    expect(output).toContain("x=5, y=15");
  });

  test("triple nested tuple", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local deep: (((int, int), int), int) = (((1, 2), 3), 4);
        
        match (deep) {
          (((a, b), c), d) => {
            printf("a=%d, b=%d, c=%d, d=%d\\n", a, b, c, d);
          }
        }
      }
    `);
    expect(output).toContain("a=1, b=2, c=3, d=4");
  });

  test("nested tuple in multiple arms", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      frame test_match(val: ((int, int), int)) {
        match (val) {
          ((0, 0), 0) => printf("all zeros\\n"),
          ((1, _), _) => printf("first is one\\n"),
          ((_, 2), _) => printf("second is two\\n"),
          ((a, b), c) => printf("other: %d, %d, %d\\n", a, b, c),
        }
      }

      frame main() {
        test_match(((0, 0), 0));
        test_match(((1, 5), 9));
        test_match(((3, 2), 7));
        test_match(((4, 5), 6));
      }
    `);
    expect(output).toContain("all zeros");
    expect(output).toContain("first is one");
    expect(output).toContain("second is two");
    expect(output).toContain("other: 4, 5, 6");
  });

  test("nested tuple compiles successfully", () => {
    expect(
      compilesSuccessfully(`
        frame main() {
          local t: ((int, int), (int, int)) = ((1, 2), (3, 4));
          match (t) {
            ((a, b), (c, d)) => { }
          }
        }
      `),
    ).toBe(true);
  });
});
