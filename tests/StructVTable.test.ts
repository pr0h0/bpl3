import { describe, expect, it } from "bun:test";

import { compileToLLVM as compile } from "./helpers/compileToLLVM";

describe("Struct Layout and VTable Code Generation", () => {
  it("should generate correct layout for simple struct", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
      }
      frame main() ret int {
        local _p: Point;
        return 0;
      }
    `;
    const ir = compile(source);
    // %struct.Point = type { i32, i32 } (no implicit Type vtable for POD)
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
    // For is/as operator support, inherited structs now get vtables even without methods
    // Base: { i8*, i32 }, Derived: { i8*, i32, i32 }
    expect(ir).toContain("%struct.Derived = type { i8*, i32, i32 }");
    // Base also gets vtable since it's inherited from
    expect(ir).toContain("%struct.Base = type { i8*, i32 }");
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
    // Value receivers use adapters that load the concrete receiver copy.
    expect(ir).toMatch(
      /@Derived_vtable = .*@__bpl_value_receiver_Derived_foo_Derived/,
    );
    expect(ir).toMatch(
      /@Derived_vtable = .*@__bpl_value_receiver_Base_bar_Base/,
    );
    expect(ir).toContain(
      "call i32 @Derived_foo_Derived(%struct.Derived %receiver)",
    );
    expect(ir).toContain("call i32 @Base_bar_Base(%struct.Base %receiver)");
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
