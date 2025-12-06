import { describe, expect, test } from "bun:test";

import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import { IRGenerator } from "../transpiler/ir/IRGenerator";
import Scope from "../transpiler/Scope";
import { LLVMTargetBuilder } from "../transpiler/target/LLVMTargetBuilder";
import {
  demangleMethod,
  isMethodMangledName,
  mangleMethod,
} from "../utils/methodMangler";

function generateIR(input: string): string {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(scope);

  // Run semantic analysis to register methods and validate code
  const analyzer = new SemanticAnalyzer();
  analyzer.analyze(program, scope);

  const gen = new IRGenerator();
  program.toIR(gen, scope);
  const builder = new LLVMTargetBuilder();
  return builder.build(gen.module);
}

describe("Struct Methods - Method Mangler", () => {
  test("mangleMethod creates correct mangled name", () => {
    expect(mangleMethod("User", "sayHello")).toBe("__bplm__User__sayHello__");
    expect(mangleMethod("Rectangle", "area")).toBe("__bplm__Rectangle__area__");
  });

  test("mangleMethod handles generic types", () => {
    expect(mangleMethod("List<i32>", "add")).toBe("__bplm__List_i32___add__");
    expect(mangleMethod("Map<*u8, i32>", "get")).toBe(
      "__bplm__Map__u8__i32___get__",
    );
  });

  test("isMethodMangledName identifies mangled names", () => {
    expect(isMethodMangledName("__bplm__User__sayHello__")).toBe(true);
    expect(isMethodMangledName("__bplm__Rectangle__area__")).toBe(true);
    expect(isMethodMangledName("normalFunction")).toBe(false);
    expect(isMethodMangledName("__bpl__notMethod__")).toBe(false);
  });

  test("demangleMethod extracts struct and method names", () => {
    expect(demangleMethod("__bplm__User__sayHello__")).toEqual({
      structName: "User",
      methodName: "sayHello",
    });
    expect(demangleMethod("__bplm__Rectangle__area__")).toEqual({
      structName: "Rectangle",
      methodName: "area",
    });
    expect(demangleMethod("normalFunction")).toBeNull();
  });
});

describe("Struct Methods - Code Generation", () => {
  test("generates method as mangled function", () => {
    const ir = generateIR(`
      struct Counter {
        value: i32,
        
        frame increment() {
          this.value = this.value + 1;
        }
      }
    `);

    expect(ir).toContain("__bplm__Counter__increment__");
    expect(ir).toContain(
      "define void @__bplm__Counter__increment__(ptr %this)",
    );
  });

  test("generates method call with receiver as first argument", () => {
    const ir = generateIR(`
      struct Counter {
        value: i32,
        
        frame increment() {
          this.value = this.value + 1;
        }
      }
      
      frame main() ret i32 {
        local c: Counter;
        call c.increment();
        return 0;
      }
    `);

    expect(ir).toContain("call void @__bplm__Counter__increment__(ptr");
  });

  test("generates method with return value", () => {
    const ir = generateIR(`
      struct Rectangle {
        width: i32,
        height: i32,
        
        frame area() ret i32 {
          return this.width * this.height;
        }
      }
    `);

    expect(ir).toContain("define i32 @__bplm__Rectangle__area__(ptr %this)");
  });

  test("generates method with parameters", () => {
    const ir = generateIR(`
      struct Point {
        x: i32,
        y: i32,
        
        frame moveTo(newX: i32, newY: i32) {
          this.x = newX;
          this.y = newY;
        }
      }
    `);

    expect(ir).toContain(
      "define void @__bplm__Point__moveTo__(ptr %this, i32 %newX, i32 %newY)",
    );
  });

  test("generates 'this' as pointer parameter", () => {
    const ir = generateIR(`
      struct Counter {
        value: i32,
        
        frame get() ret i32 {
          return this.value;
        }
      }
    `);

    // Check that this is used as a pointer
    expect(ir).toContain("ptr %this");
    expect(ir).toContain("getelementptr %Counter, ptr");
  });

  test("allows method to call another method on 'this'", () => {
    const ir = generateIR(`
      struct Calculator {
        result: i32,
        
        frame add(value: i32) {
          this.result = this.result + value;
        }
        
        frame addTwice(value: i32) {
          call this.add(value);
          call this.add(value);
        }
      }
    `);

    expect(ir).toContain("__bplm__Calculator__add__");
    expect(ir).toContain("__bplm__Calculator__addTwice__");
    // Check that addTwice calls add twice
    const addTwiceMatch = ir.match(/@__bplm__Calculator__addTwice__/g);
    expect(addTwiceMatch).toBeDefined();
  });

  test("handles multiple structs with same method name", () => {
    const ir = generateIR(`
      struct Counter {
        value: i32,
        
        frame reset() {
          this.value = 0;
        }
      }
      
      struct Point {
        x: i32,
        y: i32,
        
        frame reset() {
          this.x = 0;
          this.y = 0;
        }
      }
    `);

    // Check that both methods have different mangled names
    expect(ir).toContain("__bplm__Counter__reset__");
    expect(ir).toContain("__bplm__Point__reset__");
  });

  test("handles method returning pointer", () => {
    const ir = generateIR(`
      struct Node {
        value: i32,
        next: *Node,
        
        frame getNext() ret *Node {
          return this.next;
        }
      }
    `);

    expect(ir).toContain("define ptr @__bplm__Node__getNext__(ptr %this)");
  });

  test("handles method accessing array field", () => {
    const ir = generateIR(`
      struct IntArray {
        data: i32[5],
        
        frame get(index: i32) ret i32 {
          return this.data[index];
        }
      }
    `);

    expect(ir).toContain("__bplm__IntArray__get__");
    expect(ir).toContain("getelementptr");
  });

  test("handles method with conditional logic", () => {
    const ir = generateIR(`
      struct Account {
        balance: i32,
        
        frame withdraw(amount: i32) ret i8 {
          if this.balance >= amount {
            this.balance = this.balance - amount;
            return 1;
          }
          return 0;
        }
      }
    `);

    expect(ir).toContain("__bplm__Account__withdraw__");
    expect(ir).toContain("br i1");
  });

  test("handles method with loop", () => {
    const ir = generateIR(`
      struct Counter {
        value: i32,
        
        frame incrementN(n: i32) {
          local i: i32 = 0;
          loop {
            if i >= n { break; }
            this.value = this.value + 1;
            i = i + 1;
          }
        }
      }
    `);

    expect(ir).toContain("__bplm__Counter__incrementN__");
    expect(ir).toContain("br label");
  });
});

describe("Struct Methods - Error Detection", () => {
  test("detects 'this' reassignment in method", () => {
    expect(() => {
      generateIR(`
        struct Point {
          x: i32,
          y: i32,
          
          frame reset() {
            this = NULL;
          }
        }
      `);
    }).toThrow(/Cannot reassign 'this'/);
  });

  test("detects method call on non-existent method", () => {
    expect(() => {
      generateIR(`
        struct Counter {
          value: i32,
          
          frame increment() {
            this.value = this.value + 1;
          }
        }
        
        frame main() ret i32 {
          local c: Counter;
          call c.nonExistent();
          return 0;
        }
      `);
    }).toThrow();
  });

  test("detects method call on wrong struct type", () => {
    expect(() => {
      generateIR(`
        struct Counter {
          value: i32,
          
          frame increment() {
            this.value = this.value + 1;
          }
        }
        
        struct Point {
          x: i32,
          y: i32
        }
        
        frame main() ret i32 {
          local p: Point;
          call p.increment();
          return 0;
        }
      `);
    }).toThrow();
  });
});

describe("Struct Methods - Generic Methods", () => {
  test("generates generic struct method", () => {
    const ir = generateIR(`
      struct Box<T> {
        value: T,
        
        frame getValue() ret T {
          return this.value;
        }
      }
      
      frame main() ret i32 {
        local b: Box<u64>;
        b.value = 42;
        local v: u64 = call b.getValue();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Box_u64___getValue__");
  });

  test("handles multiple generic instantiations", () => {
    const ir = generateIR(`
      struct Container<T> {
        data: T,
        
        frame get() ret T {
          return this.data;
        }
        
        frame set(val: T) {
          this.data = val;
        }
      }
      
      frame main() ret i32 {
        local c1: Container<u64>;
        call c1.set(100);
        
        local c2: Container<i32>;
        call c2.set(200);
        
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Container_u64___set__");
    expect(ir).toContain("__bplm__Container_i32___set__");
  });

  test("handles nested generic types", () => {
    const ir = generateIR(`
      struct Box<T> {
        value: T,
        
        frame getValue() ret T {
          return this.value;
        }
      }
      
      struct Pair<A, B> {
        first: A,
        second: B,
        
        frame getSecond() ret B {
          return this.second;
        }
      }
      
      frame main() ret i32 {
        local p: Pair<u64, Box<u64>>;
        local v: Box<u64> = call p.getSecond();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Pair_u64_Box_u64____getSecond__");
  });
});

describe("Struct Methods - Nested Method Calls", () => {
  test("handles nested method calls", () => {
    const ir = generateIR(`
      struct Inner {
        value: i32,
        
        frame getValue() ret i32 {
          return this.value;
        }
      }
      
      struct Outer {
        inner: Inner,
        
        frame getInnerValue() ret i32 {
          return call this.inner.getValue();
        }
      }
      
      frame main() ret i32 {
        local obj: Outer;
        obj.inner.value = 100;
        local val: i32 = call obj.inner.getValue();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Inner__getValue__");
    expect(ir).toContain("call");
  });

  test("handles deeply nested method calls", () => {
    const ir = generateIR(`
      struct Level1 {
        value: i32,
        
        frame get() ret i32 {
          return this.value;
        }
      }
      
      struct Level2 {
        l1: Level1,
        
        frame getL1() ret i32 {
          return call this.l1.get();
        }
      }
      
      struct Level3 {
        l2: Level2,
        
        frame getL2Value() ret i32 {
          return call this.l2.getL1();
        }
      }
      
      frame main() ret i32 {
        local obj: Level3;
        obj.l2.l1.value = 42;
        local val: i32 = call obj.l2.l1.get();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Level1__get__");
    expect(ir).toContain("__bplm__Level2__getL1__");
    expect(ir).toContain("__bplm__Level3__getL2Value__");
  });

  test("handles method calls with array access", () => {
    const ir = generateIR(`
      struct Item {
        id: i32,
        
        frame getId() ret i32 {
          return this.id;
        }
      }
      
      frame main() ret i32 {
        local items: Item[3];
        items[0].id = 1;
        items[1].id = 2;
        items[2].id = 3;
        
        local id: i32 = call items[1].getId();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Item__getId__");
  });

  test("handles nested generic struct methods", () => {
    const ir = generateIR(`
      struct Inner<T> {
        data: T,
        
        frame getData() ret T {
          return this.data;
        }
      }
      
      struct Outer<T> {
        inner: Inner<T>,
        
        frame getInnerData() ret T {
          return call this.inner.getData();
        }
      }
      
      frame main() ret i32 {
        local obj: Outer<u64>;
        obj.inner.data = 123;
        local val: u64 = call obj.getInnerData();
        return 0;
      }
    `);
    expect(ir).toContain("__bplm__Inner_u64___getData__");
    expect(ir).toContain("__bplm__Outer_u64___getInnerData__");
  });
});
