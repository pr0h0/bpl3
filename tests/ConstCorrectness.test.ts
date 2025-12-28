import { describe, expect, it } from "bun:test";

import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import type { FunctionTypeNode, BasicTypeNode } from "../compiler/common/AST";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker({ collectAllErrors: false });
  typeChecker.checkProgram(program);
  return program;
}

describe("Const Correctness", () => {
  it("should parse Func<void>(const int)", () => {
    const source = `
      type Callback = Func<void>(const int);
      frame main() {}
    `;
    const program = check(source);
    const typeAlias = program.statements[0] as any;
    const funcType = typeAlias.type as FunctionTypeNode;
    expect(funcType.kind).toBe("FunctionType");
    expect(funcType.paramTypes.length).toBe(1);
    const paramType = funcType.paramTypes[0] as BasicTypeNode;
    expect(paramType.name).toBe("int");
    expect(paramType.isConst).toBe(true);
  });

  it("should parse |x: const int| lambda", () => {
    const source = `
      frame main() {
        local _f: Lambda<int>(const int) = |x: const int| {
           # x = 10; # Should fail if uncommented
           return x;
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should fail assignment to const param in lambda", () => {
    const source = `
      frame main() {
        local _f: Lambda<void>(const int) = |x: const int| {
           x = 10;
        };
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail assignment to const local in lambda", () => {
    const source = `
      frame main() {
        local _f: Lambda<void>(int) = |x: int| {
           local const y: int = 10;
           y = 20;
        };
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail assignment to captured const variable", () => {
    const source = `
      frame main() {
        local const x: int = 10;
        local _f: Lambda<void>() = || {
           x = 20;
        };
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });
});
