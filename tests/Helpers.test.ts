/**
 * Tests for test helper utilities
 */
import { describe, test, expect } from "bun:test";
import {
  compileAndRun,
  compileAndRunFull,
  compilesSuccessfully,
  getCompilationErrors,
} from "./helpers/compileAndRun";
import {
  parseSource,
  parseExpression,
  parseStatement,
  parseFunction,
  parseStruct,
  parseEnum,
} from "./helpers/parser";
import {
  createTestDocument,
  findStringPosition,
  getPosition,
} from "./helpers/lsp";

describe("Test Helpers", () => {
  describe("compileAndRun helpers", () => {
    test("compileAndRun executes simple program", () => {
      const output = compileAndRun(`
        extern printf(fmt: *i8, ...) ret i32;
        frame main() {
          printf("Hello from helper test\\n");
        }
      `);
      expect(output).toContain("Hello from helper test");
    });

    test("compileAndRunFull returns full result", () => {
      const result = compileAndRunFull(`
        extern printf(fmt: *i8, ...) ret i32;
        frame main() {
          printf("test output\\n");
        }
      `);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test output");
    });

    test("compilesSuccessfully returns true for valid code", () => {
      expect(
        compilesSuccessfully(`
        frame main() { }
      `),
      ).toBe(true);
    });

    test("compilesSuccessfully returns false for invalid code", () => {
      expect(
        compilesSuccessfully(`
        frame main( { }
      `),
      ).toBe(false);
    });

    test("getCompilationErrors returns errors for invalid code", () => {
      const errors = getCompilationErrors(`
        frame main() {
          undefinedVariable;
        }
      `);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("parser helpers", () => {
    test("parseSource parses valid BPL code", () => {
      const ast = parseSource(`
        frame main() {
          local x: int = 5;
        }
      `);
      expect(ast.statements.length).toBe(1);
      expect(ast.statements[0]?.kind).toBe("FunctionDecl");
    });

    test("parseExpression parses expression", () => {
      const expr = parseExpression("1 + 2 * 3");
      expect(expr.kind).toBe("Binary");
    });

    test("parseStatement parses statement", () => {
      const stmt = parseStatement("local x: int = 5;");
      expect(stmt.kind).toBe("VariableDecl");
    });

    test("parseFunction extracts function declaration", () => {
      const func = parseFunction(`
        frame add(a: int, b: int) ret int {
          return a + b;
        }
      `);
      expect(func.name).toBe("add");
      expect(func.params).toHaveLength(2);
    });

    test("parseStruct extracts struct declaration", () => {
      const struct = parseStruct(`
        struct Point {
          x: int,
          y: int,
        }
      `);
      expect(struct.name).toBe("Point");
    });

    test("parseEnum extracts enum declaration", () => {
      const enumDecl = parseEnum(`
        enum Option<T> {
          Some(T),
          None,
        }
      `);
      expect(enumDecl.name).toBe("Option");
      expect(enumDecl.variants).toHaveLength(2);
    });
  });

  describe("LSP helpers", () => {
    test("createTestDocument creates mock document", () => {
      const doc = createTestDocument("frame main() { }");
      expect(doc.uri).toBe("file:///test/test.bpl");
      expect(doc.getText()).toBe("frame main() { }");
    });

    test("positionAt converts offset to position", () => {
      const doc = createTestDocument("line1\nline2\nline3");
      const pos = doc.positionAt(6); // Start of "line2"
      expect(pos.line).toBe(1);
      expect(pos.character).toBe(0);
    });

    test("offsetAt converts position to offset", () => {
      const doc = createTestDocument("line1\nline2\nline3");
      const offset = doc.offsetAt({ line: 1, character: 0 });
      expect(offset).toBe(6);
    });

    test("findStringPosition finds string in document", () => {
      const doc = createTestDocument("frame main() {\n  local x = 5;\n}");
      const pos = findStringPosition(doc, "local");
      expect(pos).not.toBeNull();
      expect(pos?.line).toBe(1);
    });

    test("getPosition creates position object", () => {
      const doc = createTestDocument("test");
      const pos = getPosition(doc, 5, 10);
      expect(pos).toEqual({ line: 5, character: 10 });
    });
  });
});
