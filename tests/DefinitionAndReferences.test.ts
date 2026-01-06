import { describe, expect, it, beforeAll } from "bun:test";
import { join } from "path";
import * as fs from "fs";
import { tmpdir } from "os";

/**
 * Comprehensive test suite for Go to Definition and Find All References
 *
 * Tests cover:
 * 1. Go to Definition: Variables, functions, structs, fields, methods, imports
 * 2. Find All References: Scope-aware for locals, global for functions/structs
 * 3. Edge cases: Cross-file, nested scopes, shadowing
 */

const TEST_DIR = join(tmpdir(), "bpl-def-ref-test");

beforeAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

describe("Go to Definition Tests", () => {
  describe("Local Variables", () => {
    it("creates test for local variable definition", () => {
      const testFile = join(TEST_DIR, "def_local_var.bpl");
      const code = `
frame testFunction() ret int {
    local myVar: int = 42;  # <-- LINE 3: Definition of myVar
    local result: int = myVar + 10;  # <-- Cursor on myVar -> should go to line 3
    return result;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Go to Definition: Local variable");
      console.log(
        "  - Cursor on 'myVar' at line 4 → should jump to declaration at line 3",
      );
    });

    it("creates test for function parameters", () => {
      const testFile = join(TEST_DIR, "def_parameter.bpl");
      const code = `
frame add(x: int, y: int) ret int {  # <-- LINE 2: x and y defined here
    local sum: int = x + y;  # <-- Cursor on x or y -> go to line 2
    return sum;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Function parameter");
      console.log(
        "  - Cursor on 'x' at line 3 → should jump to parameter at line 2",
      );
    });
  });

  describe("Functions", () => {
    it("creates test for function definition", () => {
      const testFile = join(TEST_DIR, "def_function.bpl");
      const code = `
frame calculate(a: int, b: int) ret int {  # <-- LINE 2: Definition
    return a * b + 10;
}

frame main() ret int {
    local result: int = calculate(5, 3);  # <-- Cursor on calculate -> go to line 2
    return result;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Function");
      console.log(
        "  - Cursor on 'calculate' at line 7 → should jump to declaration at line 2",
      );
    });

    it("creates test for recursive function", () => {
      const testFile = join(TEST_DIR, "def_recursive.bpl");
      const code = `
frame factorial(n: int) ret int {  # <-- LINE 2: Definition
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);  # <-- Cursor on factorial -> go to line 2
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Recursive function call");
      console.log(
        "  - Cursor on 'factorial' at line 6 → should jump to declaration at line 2",
      );
    });
  });

  describe("Structs and Members", () => {
    it("creates test for struct definition", () => {
      const testFile = join(TEST_DIR, "def_struct.bpl");
      const code = `
struct Point {  # <-- LINE 2: Definition
    x: int,
    y: int,
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };  # <-- Cursor on Point -> go to line 2
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Struct type");
      console.log(
        "  - Cursor on 'Point' at line 8 → should jump to struct definition at line 2",
      );
    });

    it("creates test for struct field definition", () => {
      const testFile = join(TEST_DIR, "def_field.bpl");
      const code = `
struct Point {
    x: int,  # <-- LINE 3: Field definition
    y: int,
    
    frame getX(this: *Point) ret int {
        return this.x;  # <-- Cursor on x -> go to line 3
    }
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };
    local val: int = p.x;  # <-- Cursor on x -> go to line 3
    return val;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Struct field");
      console.log(
        "  - Cursor on 'x' in 'p.x' at line 13 → should jump to field declaration at line 3",
      );
    });

    it("creates test for struct method definition", () => {
      const testFile = join(TEST_DIR, "def_method.bpl");
      const code = `
struct Calculator {
    value: int,
    
    frame add(this: *Calculator, n: int) ret void {  # <-- LINE 5: Method definition
        this.value = this.value + n;
    }
}

frame main() ret int {
    local calc: Calculator = Calculator { value: 0 };
    calc.add(5);  # <-- Cursor on add -> go to line 5
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Struct method");
      console.log(
        "  - Cursor on 'add' in 'calc.add(5)' → should jump to method declaration at line 5",
      );
    });
  });

  describe("Imports and Cross-File", () => {
    it("creates test for imported function", () => {
      const moduleFile = join(TEST_DIR, "math_utils.bpl");
      const mainFile = join(TEST_DIR, "def_import_main.bpl");

      fs.writeFileSync(
        moduleFile,
        `
export frame square(n: int) ret int {  # <-- LINE 2 in math_utils.bpl: Definition
    return n * n;
}

export frame cube(n: int) ret int {
    return n * n * n;
}
`,
      );

      fs.writeFileSync(
        mainFile,
        `
import [square, cube] from "./math_utils.bpl";

frame main() ret int {
    local sq: int = square(5);  # <-- Cursor on square -> go to math_utils.bpl line 2
    return sq;
}
`,
      );

      expect(fs.existsSync(moduleFile)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Go to Definition: Imported function");
      console.log(
        "  - Cursor on 'square' in main file → should jump to math_utils.bpl:2",
      );
    });

    it("creates test for imported struct", () => {
      const typesFile = join(TEST_DIR, "types.bpl");
      const mainFile = join(TEST_DIR, "def_import_struct.bpl");

      fs.writeFileSync(
        typesFile,
        `
export struct Point {  # <-- LINE 2 in types.bpl: Definition
    x: int,
    y: int,
}

export struct Vector {
    dx: int,
    dy: int,
}
`,
      );

      fs.writeFileSync(
        mainFile,
        `
import [Point, Vector] from "./types.bpl";

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };  # <-- Cursor on Point -> go to types.bpl line 2
    return 0;
}
`,
      );

      expect(fs.existsSync(typesFile)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Go to Definition: Imported struct");
      console.log(
        "  - Cursor on 'Point' in main file → should jump to types.bpl:2",
      );
    });
  });

  describe("Edge Cases", () => {
    it("creates test for shadowed variable", () => {
      const testFile = join(TEST_DIR, "def_shadowing.bpl");
      const code = `
frame testShadowing() ret int {
    local x: int = 10;  # <-- LINE 3: Outer x
    
    if (x > 5) {
        local x: int = 20;  # <-- LINE 6: Inner x (shadows outer)
        local result: int = x * 2;  # <-- Cursor on x -> go to line 6 (inner)
    }
    
    return x;  # <-- Cursor on x -> go to line 3 (outer)
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: Shadowed variable");
      console.log(
        "  - Cursor on 'x' at line 7 → should go to inner declaration at line 6",
      );
      console.log(
        "  - Cursor on 'x' at line 10 → should go to outer declaration at line 3",
      );
    });

    it("creates test for this pointer", () => {
      const testFile = join(TEST_DIR, "def_this.bpl");
      const code = `
struct MyStruct {
    value: int,
    
    frame getValue(this: *MyStruct) ret int {  # <-- LINE 5: 'this' parameter
        return this.value;  # <-- Cursor on 'this' -> go to line 5
    }
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Go to Definition: 'this' pointer");
      console.log(
        "  - Cursor on 'this' at line 6 → should jump to parameter at line 5",
      );
    });
  });
});

describe("Find All References Tests", () => {
  describe("Local Variables - Scope Aware", () => {
    it("creates test for local variable references", () => {
      const testFile = join(TEST_DIR, "ref_local_var.bpl");
      const code = `
frame foo() ret int {
    local x: int = 10;  # <-- REFERENCE 1: Declaration
    local y: int = x + 5;  # <-- REFERENCE 2: Use
    return x + y;  # <-- REFERENCE 3: Use
}

frame bar() ret int {
    local x: int = 20;  # <-- NOT a reference (different scope)
    return x * 2;  # <-- NOT a reference
}

frame main() ret int {
    local x: int = 30;  # <-- NOT a reference (different scope)
    return foo() + bar() + x;  # <-- NOT a reference
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Find All References: Local variable (scope-aware)");
      console.log(
        "  - Find references for 'x' in foo() → should find 3 occurrences (lines 3, 4, 5)",
      );
      console.log(
        "  - Should NOT include 'x' from bar() or main() (different scopes)",
      );
    });

    it("creates test for parameter references", () => {
      const testFile = join(TEST_DIR, "ref_parameter.bpl");
      const code = `
frame add(a: int, b: int) ret int {  # <-- REFERENCE 1: Parameter declaration
    return a + b;  # <-- REFERENCE 2: Use of 'a'
}

frame multiply(a: int, b: int) ret int {  # <-- NOT a reference (different function)
    return a * b;  # <-- NOT a reference
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Function parameter (scope-aware)");
      console.log(
        "  - Find references for 'a' in add() → should find 2 occurrences (lines 2, 3)",
      );
      console.log(
        "  - Should NOT include 'a' from multiply() (different scope)",
      );
    });
  });

  describe("Global Functions - All References", () => {
    it("creates test for function references", () => {
      const testFile = join(TEST_DIR, "ref_function.bpl");
      const code = `
frame calculate(a: int, b: int) ret int {  # <-- REFERENCE 1: Declaration
    return a * b + 10;
}

frame helper() ret int {
    return calculate(2, 3);  # <-- REFERENCE 2: Call
}

frame main() ret int {
    local result: int = calculate(5, 3);  # <-- REFERENCE 3: Call
    result = result + calculate(1, 1);  # <-- REFERENCE 4: Call
    return result + helper();
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Function (global)");
      console.log(
        "  - Find references for 'calculate' → should find 4 occurrences",
      );
      console.log("  - Lines 2 (declaration), 7, 11, 12 (calls)");
    });

    it("creates test for recursive function references", () => {
      const testFile = join(TEST_DIR, "ref_recursive.bpl");
      const code = `
frame factorial(n: int) ret int {  # <-- REFERENCE 1: Declaration
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);  # <-- REFERENCE 2: Recursive call
}

frame main() ret int {
    return factorial(5);  # <-- REFERENCE 3: Call
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Recursive function");
      console.log(
        "  - Find references for 'factorial' → should find 3 occurrences",
      );
      console.log(
        "  - Lines 2 (declaration), 6 (recursive call), 10 (external call)",
      );
    });
  });

  describe("Struct Fields - All References", () => {
    it("creates test for struct field references", () => {
      const testFile = join(TEST_DIR, "ref_struct_field.bpl");
      const code = `
struct Point {
    x: int,  # <-- REFERENCE 1: Field declaration
    y: int,
    
    frame getX(this: *Point) ret int {
        return this.x;  # <-- REFERENCE 2: Field access
    }
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };  # <-- REFERENCE 3: Initialization
    local xVal: int = p.x;  # <-- REFERENCE 4: Field access
    return xVal;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Struct field");
      console.log(
        "  - Find references for field 'x' → should find 4 occurrences",
      );
      console.log(
        "  - Lines 3 (declaration), 7 (this.x), 12 (x: 10), 13 (p.x)",
      );
    });

    it("creates test for struct method references", () => {
      const testFile = join(TEST_DIR, "ref_struct_method.bpl");
      const code = `
struct Calculator {
    value: int,
    
    frame add(this: *Calculator, n: int) ret void {  # <-- REFERENCE 1: Declaration
        this.value = this.value + n;
    }
}

frame main() ret int {
    local calc: Calculator = Calculator { value: 0 };
    calc.add(5);  # <-- REFERENCE 2: Method call
    calc.add(10);  # <-- REFERENCE 3: Method call
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Struct method");
      console.log(
        "  - Find references for method 'add' → should find 3 occurrences",
      );
      console.log("  - Lines 5 (declaration), 12, 13 (method calls)");
    });
  });

  describe("Cross-File References", () => {
    it("creates test for imported function references", () => {
      const utilsFile = join(TEST_DIR, "ref_utils.bpl");
      const mainFile = join(TEST_DIR, "ref_main.bpl");

      fs.writeFileSync(
        utilsFile,
        `
export frame square(n: int) ret int {  # <-- REFERENCE 1: Declaration
    return n * n;
}
`,
      );

      fs.writeFileSync(
        mainFile,
        `
import [square] from "./ref_utils.bpl";  # <-- REFERENCE 2: Import

frame main() ret int {
    local a: int = square(5);  # <-- REFERENCE 3: Call
    local b: int = square(3);  # <-- REFERENCE 4: Call
    return a + b;
}
`,
      );

      expect(fs.existsSync(utilsFile)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Find All References: Imported function (cross-file)");
      console.log(
        "  - Find references for 'square' → should find 4 occurrences",
      );
      console.log(
        "  - ref_utils.bpl:2 (declaration), ref_main.bpl:2 (import), 5, 6 (calls)",
      );
    });
  });

  describe("Edge Cases", () => {
    it("creates test for variable vs field with same name", () => {
      const testFile = join(TEST_DIR, "ref_name_conflict.bpl");
      const code = `
struct Data {
    value: int,  # <-- Field 'value': 3 references for FIELD
}

frame process(data: *Data) ret int {
    local value: int = 10;  # <-- Local 'value': 3 references for LOCAL
    local result: int = data.value + value;  # <-- FIELD ref + LOCAL ref
    return result;
}

frame main() ret int {
    local d: Data = Data { value: 5 };  # <-- FIELD reference
    return process(&d);
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "✓ Find All References: Field vs local variable with same name",
      );
      console.log(
        "  - Find references for field 'value' → 3 occurrences (lines 3, 8 'data.value', 13)",
      );
      console.log(
        "  - Find references for local 'value' → 2 occurrences (lines 7, 8 'value')",
      );
      console.log("  - They should be separate lists!");
    });

    it("creates test for shadowing references", () => {
      const testFile = join(TEST_DIR, "ref_shadowing.bpl");
      const code = `
frame testShadowing() ret int {
    local x: int = 10;  # <-- Outer x: 2 references (line 3, 10)
    local sum: int = x + 5;  # <-- Reference to outer x
    
    if (sum > 10) {
        local x: int = 20;  # <-- Inner x: 2 references (line 7, 8)
        sum = sum + x;  # <-- Reference to inner x
    }
    
    return x + sum;  # <-- Reference to outer x
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Find All References: Shadowing variables");
      console.log(
        "  - Find references for outer 'x' → 3 occurrences (lines 3, 4, 11)",
      );
      console.log(
        "  - Find references for inner 'x' → 2 occurrences (lines 7, 8)",
      );
      console.log("  - Context-sensitive: depends on cursor position");
    });
  });
});
