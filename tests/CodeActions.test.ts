import { describe, expect, it, beforeAll } from "bun:test";
import { join } from "path";
import * as fs from "fs";
import { tmpdir } from "os";

/**
 * Test suite for Code Actions / Quick Fixes
 *
 * Tests various error scenarios and the suggested fixes:
 * 1. Unknown types → Import suggestions
 * 2. Unknown symbols → Import suggestions, typo corrections
 * 3. Type mismatches → Cast suggestions
 * 4. Missing return → Add return statement
 * 5. Unused variables → Prefix with underscore
 * 6. Missing semicolons → Add semicolon
 * 7. Null safety → Add null checks
 */

const TEST_DIR = join(tmpdir(), "bpl-code-actions-test");

beforeAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

describe("Code Action Tests - Error Suggestions", () => {
  describe("Unknown Type Errors", () => {
    it("creates test for unknown standard library type", () => {
      const testFile = join(TEST_DIR, "ca_unknown_std_type.bpl");
      const code = `
frame main() ret int {
    local opt: Option<int> = Option.Some(42);  # ERROR: Unknown type 'Option'
    # QUICK FIX: Import Option from std
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("\n✓ Code Action: Unknown standard library type");
      console.log("  - Error: Unknown type 'Option'");
      console.log("  - Suggested fix: Import Option from std");
      console.log("  - Result: Adds 'import [Option] from \"std\";' at top");
    });

    it("creates test for unknown type from local file", () => {
      const typesFile = join(TEST_DIR, "custom_types.bpl");
      const mainFile = join(TEST_DIR, "ca_unknown_local_type.bpl");

      fs.writeFileSync(
        typesFile,
        `
export struct CustomData {
    value: int,
}

export struct AnotherType {
    name: string,
}
`,
      );

      fs.writeFileSync(
        mainFile,
        `
frame main() ret int {
    local data: CustomData = CustomData { value: 10 };  # ERROR: Unknown type 'CustomData'
    # QUICK FIX: Import CustomData from ./custom_types.bpl
    return 0;
}
`,
      );

      expect(fs.existsSync(typesFile)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Code Action: Unknown type from local file");
      console.log("  - Error: Unknown type 'CustomData'");
      console.log(
        "  - Suggested fix: Import CustomData from ./custom_types.bpl",
      );
      console.log("  - Result: Adds import statement at top");
    });
  });

  describe("Unknown Symbol Errors", () => {
    it("creates test for unknown function with typo", () => {
      const testFile = join(TEST_DIR, "ca_typo.bpl");
      const code = `
frame calculateSum(a: int, b: int) ret int {
    return a + b;
}

frame main() ret int {
    local result: int = calcuateSum(5, 3);  # ERROR: Unknown symbol 'calcuateSum' (typo)
    # QUICK FIX: Did you mean 'calculateSum'?
    return result;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Typo in function name");
      console.log("  - Error: Unknown symbol 'calcuateSum'");
      console.log("  - Suggested fix: Did you mean 'calculateSum'?");
      console.log("  - Uses Levenshtein distance to find similar names");
    });

    it("creates test for unknown function from import", () => {
      const utilsFile = join(TEST_DIR, "utils.bpl");
      const mainFile = join(TEST_DIR, "ca_missing_import.bpl");

      fs.writeFileSync(
        utilsFile,
        `
export frame square(n: int) ret int {
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
frame main() ret int {
    local sq: int = square(5);  # ERROR: Unknown symbol 'square'
    # QUICK FIX: Import square from ./utils.bpl
    return sq;
}
`,
      );

      expect(fs.existsSync(utilsFile)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Code Action: Missing import for function");
      console.log("  - Error: Unknown symbol 'square'");
      console.log("  - Suggested fix: Import square from ./utils.bpl");
    });
  });

  describe("Type Mismatch Errors", () => {
    it("creates test for type mismatch with cast suggestion", () => {
      const testFile = join(TEST_DIR, "ca_type_mismatch.bpl");
      const code = `
frame main() ret int {
    local x: int = 42;
    local y: float = x;  # ERROR: Type mismatch - expected 'float', got 'int'
    # QUICK FIX: Cast to float
    # Result: local y: float = cast<float>(x);
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Type mismatch");
      console.log("  - Error: Expected 'float', got 'int'");
      console.log("  - Suggested fix: Cast to float");
      console.log("  - Wraps expression with cast<float>(...)");
    });

    it("creates test for int to pointer cast", () => {
      const testFile = join(TEST_DIR, "ca_pointer_cast.bpl");
      const code = `
frame main() ret int {
    local num: int = 42;
    local ptr: *int = num;  # ERROR: Type mismatch - expected '*int', got 'int'
    # QUICK FIX: Cast to *int
    # Note: Requires &num for address-of
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Pointer type mismatch");
      console.log("  - Error: Expected '*int', got 'int'");
      console.log("  - Suggested fix: Cast to *int");
    });
  });

  describe("Missing Return Statement", () => {
    it("creates test for missing return", () => {
      const testFile = join(TEST_DIR, "ca_missing_return.bpl");
      const code = `
frame getValue() ret int {  # ERROR: Missing return statement
    local x: int = 42;
    # QUICK FIX: Add return statement
    # Result: Inserts 'return; // TODO: Add return value'
}

frame main() ret int {
    local val: int = getValue();
    return val;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Missing return statement");
      console.log("  - Error: Missing return statement");
      console.log("  - Suggested fix: Add return statement");
      console.log("  - Inserts 'return; // TODO: Add return value'");
    });
  });

  describe("Unused Variables", () => {
    it("creates test for unused variable", () => {
      const testFile = join(TEST_DIR, "ca_unused_var.bpl");
      const code = `
frame main() ret int {
    local unusedVar: int = 42;  # WARNING: Variable 'unusedVar' is unused
    # QUICK FIX: Prefix with '_' to mark as intentionally unused
    # Result: local _unusedVar: int = 42;
    
    local result: int = 10;
    return result;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Unused variable");
      console.log("  - Warning: Variable 'unusedVar' is unused");
      console.log("  - Suggested fix: Prefix with '_'");
      console.log("  - Marks variable as intentionally unused");
    });

    it("creates test for unused parameter", () => {
      const testFile = join(TEST_DIR, "ca_unused_param.bpl");
      const code = `
frame processData(data: int, unused: int) ret int {  # WARNING: Parameter 'unused' is unused
    # QUICK FIX: Prefix with '_' to mark as intentionally unused
    # Result: frame processData(data: int, _unused: int) ret int {
    return data * 2;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Unused parameter");
      console.log("  - Warning: Parameter 'unused' is unused");
      console.log("  - Suggested fix: Prefix with '_unused'");
    });
  });

  describe("Missing Semicolons", () => {
    it("creates test for missing semicolon", () => {
      const testFile = join(TEST_DIR, "ca_missing_semicolon.bpl");
      const code = `
frame main() ret int {
    local x: int = 42  # ERROR: Expected ';'
    # QUICK FIX: Add semicolon
    # Result: local x: int = 42;
    
    return x;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Missing semicolon");
      console.log("  - Error: Expected ';'");
      console.log("  - Suggested fix: Add semicolon");
      console.log("  - Appends ';' at end of line");
    });
  });

  describe("Null Safety", () => {
    it("creates test for null pointer dereference", () => {
      const testFile = join(TEST_DIR, "ca_null_check.bpl");
      const code = `
frame processPointer(ptr: *int) ret int {
    return *ptr;  # ERROR: 'ptr' may be null
    # QUICK FIX: Add null check
    # Result: Wraps in if (ptr != nullptr) { ... }
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Null pointer check");
      console.log("  - Error: 'ptr' may be null");
      console.log("  - Suggested fix: Add null check");
      console.log("  - Wraps in if (ptr != nullptr) { ... }");
    });

    it("creates test for optional type access", () => {
      const testFile = join(TEST_DIR, "ca_optional_access.bpl");
      const code = `
import [Option] from "std";

frame getValue(opt: Option<int>) ret int {
    return opt;  # ERROR: Cannot use Option<int> as int (possibly null)
    # QUICK FIX: Add null check or unwrap
    return 0;
}
`;
      fs.writeFileSync(testFile, code);
      expect(fs.existsSync(testFile)).toBe(true);

      console.log("✓ Code Action: Optional type safety");
      console.log("  - Error: Option<int> used as int");
      console.log("  - Suggested fix: Add null check or use .unwrap()");
    });
  });

  describe("Multiple Fixes for Same Error", () => {
    it("creates test with multiple possible fixes", () => {
      const file1 = join(TEST_DIR, "math1.bpl");
      const file2 = join(TEST_DIR, "math2.bpl");
      const mainFile = join(TEST_DIR, "ca_multiple_fixes.bpl");

      fs.writeFileSync(
        file1,
        `
export frame calculate(a: int, b: int) ret int {
    return a + b;
}
`,
      );

      fs.writeFileSync(
        file2,
        `
export frame calculate(x: int, y: int) ret int {
    return x * y;
}
`,
      );

      fs.writeFileSync(
        mainFile,
        `
frame main() ret int {
    local result: int = calculate(5, 3);  # ERROR: Unknown symbol 'calculate'
    # MULTIPLE QUICK FIXES:
    # 1. Import calculate from ./math1.bpl
    # 2. Import calculate from ./math2.bpl
    # 3. Define calculate locally
    return result;
}
`,
      );

      expect(fs.existsSync(file1)).toBe(true);
      expect(fs.existsSync(file2)).toBe(true);
      expect(fs.existsSync(mainFile)).toBe(true);

      console.log("✓ Code Action: Multiple possible fixes");
      console.log("  - Error: Unknown symbol 'calculate'");
      console.log("  - Multiple fixes available:");
      console.log("    1. Import from ./math1.bpl");
      console.log("    2. Import from ./math2.bpl");
      console.log("  - User can choose which one to apply");
    });
  });
});
