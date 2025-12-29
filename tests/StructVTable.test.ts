import { describe, expect, it } from "bun:test";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function compile(source: string): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

describe("Struct Layout and VTable Code Generation", () => {
  it("should generate correct layout for simple struct", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
      }
      frame main() ret int {
        local p: Point;
        return 0;
      }
    `;
    const ir = compile(source);
    // %struct.Point = type { i32, i32 }
    expect(ir).toContain("%struct.Point = type { i32, i32 }");
  });

  it("should generate correct layout for inherited struct", () => {
    const source = `
      struct Base {
        a: int,
      }
      struct Derived : Base {
        b: int,
      }
      frame main() ret int { return 0; }
    `;
    const ir = compile(source);
    // Flattened layout for POD structs
    expect(ir).toContain("%struct.Derived = type { i32, i32 }");
  });

  it("should generate vtable for struct with methods", () => {
    const source = `
      struct Animal {
        frame speak(this: Animal) ret int { return 1; }
      }
      frame main() ret int { return 0; }
    `;
    const ir = compile(source);

    // Should have a vtable global
    expect(ir).toContain("@Animal_vtable =");
    // Struct should have vtable pointer (i8*)
    expect(ir).toContain("%struct.Animal = type { i8* }");
  });

  it("should generate correct vtable entries for overrides", () => {
    const source = `
      struct Base {
        frame foo(this: Base) ret int { return 1; }
        frame bar(this: Base) ret int { return 2; }
      }
      
      struct Derived : Base {
        frame foo(this: Derived) ret int { return 3; } # Override
        # bar inherited
        frame baz(this: Derived) ret int { return 4; } # New
      }
      
      frame main() ret int { return 0; }
    `;
    const ir = compile(source);

    // Base vtable: [foo, bar]
    // Derived vtable: [Derived_foo, Base_bar, Derived_baz]

    expect(ir).toContain("@Base_vtable =");
    expect(ir).toContain("@Derived_vtable =");

    // Check Derived vtable content
    // It should point to Derived_foo (or similar name mangling)
    expect(ir).toMatch(/@Derived_vtable = .*@Derived_foo/);
    // It should point to Base_bar
    expect(ir).toMatch(/@Derived_vtable = .*@Base_bar/);
  });

  it("should perform dynamic dispatch", () => {
    const source = `
      struct Base {
        frame foo(this: Base) ret int { return 1; }
      }
      struct Derived : Base {
        frame foo(this: Derived) ret int { return 2; }
      }
      
      frame run(b: *Base) ret int {
        return b.foo();
      }
      
      frame main() ret int {
        local d: Derived;
        return run(&d);
      }
    `;
    const ir = compile(source);

    // In 'run', it should load the vtable pointer from 'b'
    expect(ir).toContain("define i32 @run");
    // Access vtable ptr (field 0)
    expect(ir).toContain("getelementptr");
    // Load vtable ptr (i8*)
    expect(ir).toContain("load i8*");
    // Cast to vtable type (i8**) or similar?
    // Actually, if it loads i8*, it needs to bitcast it to access the function pointer.
    // Or maybe it loads it as i8** if the struct field was typed that way, but it's i8*.

    // Let's just check for the call sequence generally
    expect(ir).toContain("call i32"); // call function ptr
  });
});
