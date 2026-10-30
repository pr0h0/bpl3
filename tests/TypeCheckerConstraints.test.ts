import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

describe("TypeChecker - Generic Constraints", () => {
  it("should accept generic function call satisfying constraint", () => {
    const source = `
      struct Box<T> { val: T, }
      frame make_box<T>(val: T) ret Box<T> {
          local b: Box<T>;
          b.val = val;
          return b;
      }
      frame process<T: Box<int>>(_val: T) {}
      
      frame main() {
        local b: Box<int> = make_box<int>(10);
        process<Box<int>>(b);
      }
    `;
    const errors = check(source);
    expect(errors).toHaveLength(0);
  });

  it("should reject generic function call violating constraint", () => {
    const source = `
      struct Box<T> { val: T, }
      frame make_box<T>(val: T) ret Box<T> {
          local b: Box<T>;
          b.val = val;
          return b;
      }
      frame process<T: Box<int>>(_val: T) {}
      
      frame main() {
        local b: Box<string> = make_box<string>("hello");
        process<Box<string>>(b);
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should reject generic function call with primitive type violating constraint", () => {
    const source = `
      frame process<T: int>(_val: T) {}
      
      frame main() {
        process<string>("hello");
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should accept generic function call with primitive type satisfying constraint", () => {
    const source = `
      frame process<T: int>(_val: T) {}
      
      frame main() {
        process<int>(10);
      }
    `;
    const errors = check(source);
    expect(errors).toHaveLength(0);
  });

  it("should accept generic function call with subclass satisfying constraint", () => {
    const source = `
      struct Parent { x: int, }
      struct Child : Parent { y: int, }
      
      frame process<T: Parent>(_val: T) {}
      
      frame main() {
        local c: Child = Child{ x: 1, y: 2, };
        process<Child>(c);
      }
    `;
    const errors = check(source);
    expect(errors).toHaveLength(0);
  });

  it("should validate constraints on struct instantiation", () => {
    const source = `
      struct ConstrainedBox<T: int> { val: T, }
      
      frame main() {
        local b: ConstrainedBox<string>;
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should validate constraints on type alias instantiation", () => {
    const source = `
      struct Box<T> { val: T, }
      type IntBox<T: int> = Box<T>;
      
      frame main() {
        local b: IntBox<string>;
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should handle multiple generic parameters with constraints", () => {
    const source = `
      frame func<T: int, U: string>(_a: T, _b: U) {}
      
      frame main() {
        func<int, int>(10, 20);
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should handle nested generic constraints", () => {
    const source = `
      struct Container<T> { val: T, }
      frame process<U: Container<int>>(_val: U) {}
      
      frame main() {
        local c: Container<string>;
        process<Container<string>>(c);
      }
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("does not satisfy constraint");
  });

  it("should allow valid nested generic constraints", () => {
    const source = `
      struct Container<T> { val: T, }
      frame process<U: Container<int>>(_val: U) {}
      
      frame main() {
        local c: Container<int>;
        process<Container<int>>(c);
      }
    `;
    const errors = check(source);
    expect(errors).toHaveLength(0);
  });

  it("should reject generic method in generic struct with same generic parameter name", () => {
    const source = `
      struct X<T> {
        frame y<T>() {}
      }
      
      frame main() {}
    `;
    const errors = check(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("Shadowing of generic parameter");
  });
});
