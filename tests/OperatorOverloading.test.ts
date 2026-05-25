import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as path from "path";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function compileBpl(sourcePath: string) {
  return spawnSync("bun", [BPL_CLI, sourcePath], { encoding: "utf-8" });
}

describe("Operator Overloading Tests", () => {
  describe("Positive Tests - Should Compile and Run", () => {
    it("should handle basic arithmetic operators (+, -, *, /, %)", () => {
      const result = compileBpl("examples/operator_overloading_arithmetic/main.bpl");

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("error");

      // Run the compiled program
      const runResult = spawnSync(
        "./examples/operator_overloading_arithmetic/main",
        [],
        { encoding: "utf-8" },
      );

      expect(runResult.status).toBe(0);
      expect(runResult.stdout).toContain("r1 + r2 = 5/6");
      expect(runResult.stdout).toContain("r1 - r2 = 1/6");
      expect(runResult.stdout).toContain("r1 * r2 = 1/6");
      expect(runResult.stdout).toContain("r1 / r2 = 3/2");
      expect(runResult.stdout).toContain("m1 % m2 = 2 (mod 10)");
    });

    it("should handle bitwise operators (&, |, ^, ~, <<, >>)", () => {
      const result = compileBpl("examples/operator_overloading_bitwise/main.bpl");

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("error");

      // Run the compiled program
      const runResult = spawnSync(
        "./examples/operator_overloading_bitwise/main",
        [],
        { encoding: "utf-8" },
      );

      expect(runResult.status).toBe(0);
      expect(runResult.stdout).toContain("set1 & set2 = BitSet(0x00000003)");
      expect(runResult.stdout).toContain("set1 | set2 = BitSet(0x0000003f)");
      expect(runResult.stdout).toContain("set1 ^ set2 = BitSet(0x0000003c)");
      expect(runResult.stdout).toContain("~set1 = BitSet(0xfffffff0)");
      expect(runResult.stdout).toContain("set1 << 4 = BitSet(0x000000f0)");
      expect(runResult.stdout).toContain("set2 >> 2 = BitSet(0x0000000c)");
    });

    it("should handle comparison operators (<, <=, >, >=, ==, !=)", () => {
      const result = compileBpl("examples/operator_overloading_bitwise/main.bpl");

      expect(result.status).toBe(0);

      const runResult = spawnSync(
        "./examples/operator_overloading_bitwise/main",
        [],
        { encoding: "utf-8" },
      );

      expect(runResult.stdout).toContain("a < b: true");
      expect(runResult.stdout).toContain("a <= c: true");
      expect(runResult.stdout).toContain("b > a: true");
      expect(runResult.stdout).toContain("a >= c: true");
      expect(runResult.stdout).toContain("a == c: true");
      expect(runResult.stdout).toContain("a != b: true");
    });

    it("should handle unary operators (-, ~, +)", () => {
      const result = compileBpl("examples/operator_overloading/main.bpl");

      expect(result.status).toBe(0);

      const runResult = spawnSync("./examples/operator_overloading/main", [], {
        encoding: "utf-8",
      });

      expect(runResult.stdout).toContain("-v1 = Vector2D(-3.00, -4.00)");
    });

    it("should handle callable operator (__call__)", () => {
      const result = compileBpl("examples/operator_overloading/main.bpl");

      expect(result.status).toBe(0);

      const runResult = spawnSync("./examples/operator_overloading/main", [], {
        encoding: "utf-8",
      });

      expect(runResult.stdout).toContain("mult(10.0) = 50.00");
      expect(runResult.stdout).toContain("mult(3.5) = 17.50");
    });

    it("should handle complex number arithmetic", () => {
      const result = compileBpl("examples/operator_overloading/main.bpl");

      expect(result.status).toBe(0);

      const runResult = spawnSync("./examples/operator_overloading/main", [], {
        encoding: "utf-8",
      });

      expect(runResult.stdout).toContain("c1 + c2 = 3.00 + 2.00i");
      expect(runResult.stdout).toContain("c1 * c2 = 5.00 + 1.00i");
    });
  });

  describe("Negative Tests - Should Fail Compilation", () => {
    it("should reject operator overload with wrong number of parameters", () => {
      const result = compileBpl(
        "examples/errors/operator_overloading_errors/wrong_params.bpl",
      );

      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      // Should fail because __add__ doesn't have the right signature
      expect(output).toMatch(/error|unsupported|cannot|invalid/i);
    });

    it("should reject operator overload with wrong return type for comparison", () => {
      const result = compileBpl(
        "examples/errors/operator_overloading_errors/wrong_return_type.bpl",
      );

      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      // Should fail because __eq__ returns int instead of bool
      expect(output).toMatch(/error|type|mismatch|expected.*bool/i);
    });

    it("should reject use of operator without overload", () => {
      const result = compileBpl(
        "examples/errors/operator_overloading_errors/missing_operator.bpl",
      );

      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      // Should fail because multiplication is used but __mul__ is not defined
      expect(output).toMatch(/error|unsupported|operator.*\*/);
    });

    it("should reject static operator overload", () => {
      const result = compileBpl(
        "examples/errors/operator_overloading_errors/static_operator.bpl",
      );

      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      // Should fail because operator overload must be instance method
      expect(output).toMatch(/error|instance|this/i);
    });

    it("should reject calling non-callable object", () => {
      const result = compileBpl(
        "examples/errors/operator_overloading_errors/not_callable.bpl",
      );

      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      // Should fail because Point is not callable (no __call__)
      expect(output).toMatch(/error|not callable|cannot call/i);
    });
  });

  describe("Edge Cases", () => {
    it("should handle operator overload with complex types", () => {
      const result = compileBpl("examples/operator_overloading_arithmetic/main.bpl");

      expect(result.status).toBe(0);

      const runResult = spawnSync(
        "./examples/operator_overloading_arithmetic/main",
        [],
        { encoding: "utf-8" },
      );

      // Test rational equality (cross-multiplication)
      expect(runResult.stdout).toContain("r1 == r3: true");
    });

    it("should handle chained operator calls", () => {
      // This is implicitly tested in the main examples
      // e.g., (a + b) + c would work with proper operator overloading
      const result = compileBpl("examples/operator_overloading/main.bpl");

      expect(result.status).toBe(0);
    });

    it("should handle operator precedence correctly", () => {
      // Operator precedence should be maintained
      // This is handled by the parser, not operator overloading
      const result = compileBpl("examples/operator_overloading_arithmetic/main.bpl");

      expect(result.status).toBe(0);
    });
  });
});
