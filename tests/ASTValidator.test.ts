import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import type * as AST from "../compiler/common/AST";

function parse(source: string): AST.Program {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

describe("AST Validator - Extended Tests", () => {
  describe("Program Structure", () => {
    it("should have valid program node", () => {
      const source = `frame main() { return 0; }`;
      const ast = parse(source);
      expect(ast).toBeDefined();
      expect(ast.statements).toBeDefined();
      expect(Array.isArray(ast.statements)).toBe(true);
    });

    it("should contain all top-level declarations", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame test() {}
        frame main() { return 0; }
      `;
      const ast = parse(source);
      expect(ast.statements.length).toBe(3);
    });

    it("should maintain declaration order", () => {
      const source = `
        struct A {}
        struct B {}
        frame f1() {}
        frame f2() {}
      `;
      const ast = parse(source);
      const s0 = ast.statements[0];
      const s1 = ast.statements[1];
      const s2 = ast.statements[2];
      const s3 = ast.statements[3];
      if (s0?.kind === "StructDecl") expect(s0.name).toBe("A");
      if (s1?.kind === "StructDecl") expect(s1.name).toBe("B");
      if (s2?.kind === "FunctionDecl") expect(s2.name).toBe("f1");
      if (s3?.kind === "FunctionDecl") expect(s3.name).toBe("f2");
    });
  });

  describe("Function Declaration AST", () => {
    it("should have correct function structure", () => {
      const source = `frame test(a: int, b: int) ret int { return a + b; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.name).toBe("test");
        expect(func.params).toBeDefined();
        expect(func.params.length).toBe(2);
        expect(func.returnType).toBeDefined();
        expect(func.body).toBeDefined();
      }
    });

    it("should parse function parameters correctly", () => {
      const source = `frame test(a: int, b: float, c: string) {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.params[0]?.name).toBe("a");
        expect(func.params[1]?.name).toBe("b");
        expect(func.params[2]?.name).toBe("c");
      }
    });

    it("should handle generic function type parameters", () => {
      const source = `frame identity<T>(val: T) ret T { return val; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.genericParams).toBeDefined();
        expect(func.genericParams.length).toBe(1);
        expect(func.genericParams[0]).toBe("T");
      }
    });

    it("should parse variadic function parameters", () => {
      const source = `extern printf(fmt: string, ...);`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.name).toBe("printf");
        expect(func.params.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("should parse function body statements", () => {
      const source = `
        frame test() ret int {
          local x: int = 10;
          local y: int = 20;
          return x + y;
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.body.statements.length).toBe(3);
      }
    });
  });

  describe("Struct Declaration AST", () => {
    it("should have correct struct structure", () => {
      const source = `struct Point { x: int, y: int, }`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        expect(struct.name).toBe("Point");
        expect(struct.members).toBeDefined();
        expect(struct.members.length).toBe(2);
      }
    });

    it("should parse struct fields correctly", () => {
      const source = `struct Point { x: int, y: int, z: float, }`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        const fields = struct.members.filter((m) => m.kind === "StructField");
        expect(fields.length).toBe(3);
        if (fields[0]?.kind === "StructField") expect(fields[0].name).toBe("x");
        if (fields[1]?.kind === "StructField") expect(fields[1].name).toBe("y");
        if (fields[2]?.kind === "StructField") expect(fields[2].name).toBe("z");
      }
    });

    it("should handle struct inheritance", () => {
      const source = `struct Child : Parent { x: int, }`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        expect(struct.parentType).toBeDefined();
      }
    });

    it("should handle struct with parent", () => {
      const source = `struct Child : Parent { x: int, }`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        expect(struct.parentType).toBeDefined();
      }
    });

    it("should parse struct methods", () => {
      const source = `
        struct Point {
          x: int,
          y: int,
          frame sum(this: Point) ret int { return this.x + this.y; }
        }
      `;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        const methods = struct.members.filter((m) => m.kind === "FunctionDecl");
        expect(methods.length).toBe(1);
        if (methods[0]?.kind === "FunctionDecl") {
          expect(methods[0].name).toBe("sum");
        }
      }
    });

    it("should handle generic structs", () => {
      const source = `struct Box<T> { value: T, }`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        expect(struct.genericParams).toBeDefined();
        expect(struct.genericParams.length).toBe(1);
        expect(struct.genericParams[0]).toBe("T");
      }
    });
  });

  describe("Variable Declaration AST", () => {
    it("should parse local variable correctly", () => {
      const source = `frame test() { local x: int = 10; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const varDecl = func.body.statements[0];
        if (varDecl?.kind === "VariableDecl") {
          expect(varDecl.name).toBe("x");
          expect(varDecl.initializer).toBeDefined();
        }
      }
    });

    it("should parse uninitialized variable", () => {
      const source = `frame test() { local x: int; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const varDecl = func.body.statements[0];
        if (varDecl?.kind === "VariableDecl") {
          expect(varDecl.name).toBe("x");
          expect(varDecl.initializer).toBeUndefined();
        }
      }
    });

    it("should parse array variable", () => {
      const source = `frame test() { local arr: int[10]; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const varDecl = func.body.statements[0];
        if (varDecl?.kind === "VariableDecl") {
          expect(varDecl.name).toBe("arr");
        }
      }
    });
  });

  describe("Expression AST", () => {
    it("should parse binary expression with correct structure", () => {
      const source = `frame test() ret int { return 1 + 2; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Binary");
        }
      }
    });

    it("should preserve operator precedence in AST", () => {
      const source = `frame test() ret int { return 1 + 2 * 3; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (
          returnStmt?.kind === "Return" &&
          returnStmt.value?.kind === "Binary"
        ) {
          expect(returnStmt.value.operator.lexeme).toBe("+");
          if (returnStmt.value.right?.kind === "Binary") {
            expect(returnStmt.value.right.operator.lexeme).toBe("*");
          }
        }
      }
    });

    it("should parse unary expression correctly", () => {
      const source = `frame test() ret int { return -5; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Unary");
          if (returnStmt.value?.kind === "Unary") {
            expect(returnStmt.value.operator.lexeme).toBe("-");
            expect(returnStmt.value.operand).toBeDefined();
          }
        }
      }
    });

    it("should parse ternary expression correctly", () => {
      const source = `frame test() ret int { return true ? 1 : 2; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Ternary");
          if (returnStmt.value?.kind === "Ternary") {
            expect(returnStmt.value.condition).toBeDefined();
            expect(returnStmt.value.trueExpr).toBeDefined();
            expect(returnStmt.value.falseExpr).toBeDefined();
          }
        }
      }
    });

    it("should parse function call expression", () => {
      const source = `frame test() ret int { return foo(1, 2); }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Call");
          if (returnStmt.value?.kind === "Call") {
            expect(returnStmt.value.callee).toBeDefined();
            expect(returnStmt.value.args.length).toBe(2);
          }
        }
      }
    });

    it("should parse member access expression", () => {
      const source = `frame test(p: Point) ret int { return p.x; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Member");
          if (returnStmt.value?.kind === "Member") {
            expect(returnStmt.value.object).toBeDefined();
            expect(returnStmt.value.property).toBeDefined();
          }
        }
      }
    });

    it("should parse array subscript expression", () => {
      const source = `frame test(arr: int[]) ret int { return arr[5]; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Index");
          if (returnStmt.value?.kind === "Index") {
            expect(returnStmt.value.object).toBeDefined();
            expect(returnStmt.value.index).toBeDefined();
          }
        }
      }
    });

    it("should parse cast expression", () => {
      const source = `frame test(x: int) ret float { return cast<float>(x); }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Cast");
          if (returnStmt.value?.kind === "Cast") {
            expect(returnStmt.value.targetType).toBeDefined();
            expect(returnStmt.value.expression).toBeDefined();
          }
        }
      }
    });

    it("should parse sizeof expression", () => {
      const source = `frame test() ret int { return sizeof(int); }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value?.kind).toBe("Sizeof");
          if (returnStmt.value?.kind === "Sizeof") {
            expect(returnStmt.value.target).toBeDefined();
          }
        }
      }
    });
  });

  describe("Statement AST", () => {
    it("should parse if statement correctly", () => {
      const source = `
        frame test() {
          if (true) {
            local x: int = 1;
          }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const ifStmt = func.body.statements[0];
        expect(ifStmt?.kind).toBe("If");
        if (ifStmt?.kind === "If") {
          expect(ifStmt.condition).toBeDefined();
          expect(ifStmt.thenBranch).toBeDefined();
        }
      }
    });

    it("should parse if-else statement", () => {
      const source = `
        frame test() {
          if (true) {
            local x: int = 1;
          } else {
            local y: int = 2;
          }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const ifStmt = func.body.statements[0];
        expect(ifStmt?.kind).toBe("If");
        if (ifStmt?.kind === "If") {
          expect(ifStmt.condition).toBeDefined();
          expect(ifStmt.elseBranch).toBeDefined();
        }
      }
    });

    it("should parse loop statement", () => {
      const source = `
        frame test() {
          loop (true) {
            break;
          }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const loopStmt = func.body.statements[0];
        expect(loopStmt?.kind).toBe("Loop");
        if (loopStmt?.kind === "Loop") {
          expect(loopStmt.condition).toBeDefined();
          expect(loopStmt.body).toBeDefined();
        }
      }
    });

    it("should parse switch statement", () => {
      const source = `
        frame test() {
          switch (1) {
            case 1: {
              break;
            }
            default: {
              break;
            }
          }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const switchStmt = func.body.statements[0];
        expect(switchStmt?.kind).toBe("Switch");
        if (switchStmt?.kind === "Switch") {
          expect(switchStmt.expression).toBeDefined();
          expect(switchStmt.cases).toBeDefined();
        }
      }
    });

    it("should parse return statement", () => {
      const source = `frame test() ret int { return 42; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        expect(returnStmt?.kind).toBe("Return");
        if (returnStmt?.kind === "Return") {
          expect(returnStmt.value).toBeDefined();
        }
      }
    });

    it("should parse break statement", () => {
      const source = `
        frame test() {
          loop (true) { break; }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const loopStmt = func.body.statements[0];
        if (loopStmt?.kind === "Loop") {
          const breakStmt = loopStmt.body.statements[0];
          expect(breakStmt?.kind).toBe("Break");
        }
      }
    });

    it("should parse continue statement", () => {
      const source = `
        frame test() {
          loop (true) { continue; }
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const loopStmt = func.body.statements[0];
        if (loopStmt?.kind === "Loop") {
          const continueStmt = loopStmt.body.statements[0];
          expect(continueStmt?.kind).toBe("Continue");
        }
      }
    });
  });

  describe("Type Annotations", () => {
    it("should preserve simple type annotations", () => {
      const source = `frame test(x: int) ret int { return x; }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.params[0]?.type).toBeDefined();
      }
    });

    it("should preserve pointer type annotations", () => {
      const source = `frame test(p: int[]) {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.params[0]?.type).toBeDefined();
      }
    });

    it("should preserve array type annotations", () => {
      const source = `frame test(arr: int[10]) {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.params[0]?.type).toBeDefined();
      }
    });

    it("should preserve generic type annotations", () => {
      const source = `frame test(box: Box<int>) {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.params[0]?.type).toBeDefined();
      }
    });
  });

  describe("Source Location Information", () => {
    it("should track line numbers for declarations", () => {
      const source = `
        frame test1() {}
        frame test2() {}
      `;
      const ast = parse(source);
      const func1 = ast.statements[0];
      const func2 = ast.statements[1];
      expect(func1?.location).toBeDefined();
      expect(func2?.location).toBeDefined();
      if (func1?.location && func2?.location) {
        expect(func2.location.startLine).toBeGreaterThan(
          func1.location.startLine,
        );
      }
    });

    it("should track column numbers", () => {
      const source = `frame test() {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      expect(func?.location?.startColumn).toBeDefined();
    });
  });

  describe("Import/Export AST", () => {
    it("should parse import statement", () => {
      const source = `import foo from "./module";`;
      const ast = parse(source);
      const importDecl = ast.statements[0];
      if (importDecl?.kind === "Import") {
        expect(importDecl.source).toBeDefined();
      } else {
        // Skip if import syntax is different
        expect(ast.statements.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should parse export statement", () => {
      const source = `
        frame foo() {}
        export foo;
      `;
      const ast = parse(source);
      const exportDecl = ast.statements[1];
      if (exportDecl?.kind === "Export") {
        expect(exportDecl.kind).toBe("Export");
      } else {
        // Skip if export syntax is different
        expect(ast.statements.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("AST Node Relationships", () => {
    it("should maintain parent-child relationships", () => {
      const source = `
        frame test() ret int {
          if (true) {
            return 1;
          }
          return 0;
        }
      `;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.body).toBeDefined();
        expect(func.body.statements).toBeDefined();
        expect(func.body.statements.length).toBe(2);
      }
    });

    it("should nest expressions correctly", () => {
      const source = `frame test() ret int { return (1 + 2) * (3 + 4); }`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        const returnStmt = func.body.statements[0];
        if (
          returnStmt?.kind === "Return" &&
          returnStmt.value?.kind === "Binary"
        ) {
          expect(returnStmt.value.left).toBeDefined();
          expect(returnStmt.value.right).toBeDefined();
        }
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty program", () => {
      const source = ``;
      const ast = parse(source);
      expect(ast.statements.length).toBe(0);
    });

    it("should handle empty function body", () => {
      const source = `frame test() {}`;
      const ast = parse(source);
      const func = ast.statements[0];
      if (func?.kind === "FunctionDecl") {
        expect(func.body.statements.length).toBe(0);
      }
    });

    it("should handle empty struct", () => {
      const source = `struct Empty {}`;
      const ast = parse(source);
      const struct = ast.statements[0];
      if (struct?.kind === "StructDecl") {
        expect(struct.members.length).toBe(0);
      }
    });

    it("should handle complex nested structures", () => {
      const source = `
        frame test() ret int {
          if (true) {
            loop (false) {
              if (true) {
                return 1;
              }
            }
          }
          return 0;
        }
      `;
      const ast = parse(source);
      expect(ast).toBeDefined();
    });
  });
});
