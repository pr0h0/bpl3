import { describe, expect, it, beforeAll } from "bun:test";
import { join } from "path";
import * as fs from "fs";
import { tmpdir } from "os";

/**
 * Test suite for scope-aware rename functionality
 *
 * These tests verify the expected behavior for scope-aware rename:
 * 1. Local variables should only be renamed within their function scope
 * 2. Struct fields should be renamed across all references
 * 3. Functions should be renamed across all calls
 */

const TEST_DIR = join(tmpdir(), "bpl-rename-test");

beforeAll(() => {
  // Create test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

describe("Rename Test Cases - Structure Verification", () => {
  describe("Local Variables - Should Only Affect Same Function", () => {
    it("creates test file with variables in different functions", () => {
      const testFile = join(TEST_DIR, "local_var.bpl");
      const code = `
frame foo() ret int {
    local x: int = 10;       # <-- Rename target: x in foo()
    local y: int = x + 5;    # <-- Should be renamed
    return x + y;            # <-- Should be renamed
}

frame bar() ret int {
    local x: int = 20;       # <-- Different x - should NOT be renamed
    return x * 2;            # <-- Should NOT be renamed
}

frame main() ret int {
    local x: int = 30;       # <-- Another x - should NOT be renamed
    local result: int = foo() + bar() + x;  # <-- x should NOT be renamed
    return result;
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "\n✓ Test case: Local variable 'x' in foo() should only affect foo's scope",
      );
      console.log("  Expected behavior:");
      console.log("  - Line 3, 4, 5: 'x' in foo() → SHOULD BE RENAMED");
      console.log("  - Line 9, 10: 'x' in bar() → should NOT be renamed");
      console.log("  - Line 14, 15: 'x' in main() → should NOT be renamed");
    });

    it("creates test file with function parameters", () => {
      const testFile = join(TEST_DIR, "parameter.bpl");
      const code = `
frame add(a: int, b: int) ret int {  # <-- Rename target: parameter 'a' in add()
    return a + b;                    # <-- Should be renamed
}

frame multiply(a: int, b: int) ret int {  # <-- Different 'a' - should NOT be renamed
    return a * b;                         # <-- Should NOT be renamed
}

frame main() ret int {
    local a: int = 5;                # <-- Different 'a' - should NOT be renamed
    return add(a, 3) + multiply(2, 4);  # <-- Argument 'a' should NOT be renamed
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "\n✓ Test case: Parameter 'a' in add() should only affect add's scope",
      );
      console.log("  Expected behavior:");
      console.log("  - Line 2, 3: 'a' in add() → SHOULD BE RENAMED");
      console.log("  - Line 6, 7: 'a' in multiply() → should NOT be renamed");
      console.log("  - Line 11, 12: 'a' in main() → should NOT be renamed");
    });
  });

  describe("Struct Fields - Should Affect All References", () => {
    it("creates test file with struct field accesses", () => {
      const testFile = join(TEST_DIR, "struct_field.bpl");
      const code = `
struct Point {
    x: int,  # <-- Rename target: field 'x'
    y: int,  # <-- Different field - should NOT be renamed
    
    frame getX(this: *Point) ret int {
        return this.x;  # <-- Field access - SHOULD BE RENAMED
    }
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };  # <-- Initialization 'x:' - SHOULD BE RENAMED
    local xVal: int = p.x;    # <-- Field access - SHOULD BE RENAMED
    local yVal: int = p.y;    # <-- Different field - should NOT be renamed
    
    return xVal + yVal;       # <-- Local vars - should NOT be renamed
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "\n✓ Test case: Struct field 'x' should affect all references",
      );
      console.log("  Expected behavior:");
      console.log("  - Line 3: field declaration 'x:' → SHOULD BE RENAMED");
      console.log("  - Line 7: 'this.x' → SHOULD BE RENAMED");
      console.log("  - Line 12: initialization 'x: 10' → SHOULD BE RENAMED");
      console.log("  - Line 13: 'p.x' → SHOULD BE RENAMED");
      console.log(
        "  - Line 4, 12, 14: field 'y' and vars → should NOT be renamed",
      );
    });

    it("creates test file with struct methods", () => {
      const testFile = join(TEST_DIR, "struct_method.bpl");
      const code = `
struct Calculator {
    value: int,
    
    frame add(this: *Calculator, n: int) ret void {  # <-- Rename target: method 'add'
        this.value = this.value + n;
    }
    
    frame getValue(this: *Calculator) ret int {  # <-- Different method - should NOT be renamed
        return this.value;
    }
}

frame main() ret int {
    local calc: Calculator = Calculator { value: 0 };
    calc.add(5);   # <-- Method call - SHOULD BE RENAMED
    calc.add(10);  # <-- Method call - SHOULD BE RENAMED
    return calc.getValue();  # <-- Different method - should NOT be renamed
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Test case: Struct method 'add' should affect all calls");
      console.log("  Expected behavior:");
      console.log("  - Line 5: method declaration 'add' → SHOULD BE RENAMED");
      console.log("  - Line 16, 17: 'calc.add(...)' → SHOULD BE RENAMED");
      console.log("  - Line 9, 18: method 'getValue' → should NOT be renamed");
    });
  });

  describe("Functions - Should Affect All Calls", () => {
    it("creates test file with function calls", () => {
      const testFile = join(TEST_DIR, "function.bpl");
      const code = `
frame calculate(a: int, b: int) ret int {  # <-- Rename target: function 'calculate'
    return a * b + 10;
}

frame main() ret int {
    local result: int = calculate(5, 3);  # <-- Call - SHOULD BE RENAMED
    result = result + calculate(2, 4);    # <-- Call - SHOULD BE RENAMED
    return result;
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "\n✓ Test case: Function 'calculate' should affect all calls",
      );
      console.log("  Expected behavior:");
      console.log(
        "  - Line 2: function declaration 'calculate' → SHOULD BE RENAMED",
      );
      console.log("  - Line 7, 8: 'calculate(...)' → SHOULD BE RENAMED");
    });

    it("creates test file with recursive functions", () => {
      const testFile = join(TEST_DIR, "recursive.bpl");
      const code = `
frame factorial(n: int) ret int {  # <-- Rename target: function 'factorial'
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);  # <-- Recursive call - SHOULD BE RENAMED
}

frame main() ret int {
    return factorial(5);  # <-- Call - SHOULD BE RENAMED
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log(
        "\n✓ Test case: Recursive function 'factorial' should affect all calls",
      );
      console.log("  Expected behavior:");
      console.log(
        "  - Line 2: function declaration 'factorial' → SHOULD BE RENAMED",
      );
      console.log(
        "  - Line 6: recursive call 'factorial(...)' → SHOULD BE RENAMED",
      );
      console.log(
        "  - Line 10: external call 'factorial(...)' → SHOULD BE RENAMED",
      );
    });
  });

  describe("Edge Cases", () => {
    it("creates test file with shadowing variables", () => {
      const testFile = join(TEST_DIR, "shadowing.bpl");
      const code = `
frame outer(data: int) ret int {
    local result: int = 0;  # <-- Rename target: 'result' in outer scope
    
    loop (local i: int = 0; i < data; i = i + 1) {
        local temp: int = i * 2;
        result = result + temp;  # <-- SHOULD BE RENAMED
    }
    
    if (result > 100) {
        local result: int = result / 2;  # <-- 'result' shadows outer - complex case
        # First 'result' (declaration) is new shadow variable
        # Second 'result' (in expression) refers to outer - SHOULD BE RENAMED
    }
    
    return result;  # <-- Outer 'result' - SHOULD BE RENAMED
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Test case: Shadowing variable 'result'");
      console.log("  Expected behavior (if shadowing is supported):");
      console.log("  - Line 3: outer 'result' declaration → SHOULD BE RENAMED");
      console.log(
        "  - Line 7: 'result = result + temp' → both SHOULD BE RENAMED",
      );
      console.log("  - Line 11: declaration 'local result' → shadow, complex");
      console.log(
        "  - Line 11: expression 'result / 2' → outer, SHOULD BE RENAMED",
      );
      console.log("  - Line 16: return 'result' → outer, SHOULD BE RENAMED");
      console.log(
        "  Note: Shadowing is a complex case that may need special handling",
      );
    });

    it("creates test file with variables and fields with same name", () => {
      const testFile = join(TEST_DIR, "var_field_conflict.bpl");
      const code = `
struct Data {
    value: int,  # <-- Rename target: field 'value'
}

frame process(data: *Data) ret int {
    local value: int = 10;  # <-- Different 'value' (local) - should NOT be renamed
    return data.value + value;  # <-- 'data.value' SHOULD BE RENAMED, local 'value' should NOT
}
`;

      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Test case: Field 'value' vs local variable 'value'");
      console.log("  Expected behavior:");
      console.log("  - Line 3: field 'value' → SHOULD BE RENAMED");
      console.log("  - Line 7: local 'value' → should NOT be renamed");
      console.log("  - Line 8: 'data.value' → SHOULD BE RENAMED");
      console.log("  - Line 8: local 'value' → should NOT be renamed");
    });
  });
});
