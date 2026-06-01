import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

import * as AST from "../compiler/common/AST";
import { Linter, type LintRule } from "../compiler/linter/Linter";

const location = {
  file: "linter-type-safety.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

const intType: AST.BasicTypeNode = {
  kind: "BasicType",
  name: "int",
  genericArgs: [],
  pointerDepth: 0,
  arrayDimensions: [],
  location,
};

function functionWithParameter(name: string): AST.Program {
  return {
    kind: "Program",
    location,
    statements: [
      {
        kind: "FunctionDecl",
        isFrame: true,
        isStatic: false,
        name: "main",
        attributes: [],
        genericParams: [],
        params: [
          {
            kind: "Parameter",
            name,
            type: intType,
            location,
          },
        ],
        returnType: intType,
        body: {
          kind: "Block",
          statements: [],
          location,
        },
        location,
      },
    ],
  };
}

function functionWithBodyStatement(statement: AST.Statement): AST.Program {
  const program = functionWithParameter("value");
  const [func] = program.statements as [AST.FunctionDecl];
  func.body.statements.push(statement);
  return program;
}

describe("linter type-safety guards", () => {
  test("visits function parameters without synthesizing dynamic AST nodes", () => {
    const source = readFileSync("compiler/linter/Linter.ts", "utf8");

    expect(source).not.toContain("(param as any)");
    expect(source).toContain("this.visit(param, context)");
  });

  test("lets typed lint rules observe function parameters through normal traversal", () => {
    const rule: LintRule = {
      code: "T001",
      name: "parameter-visitor-test",
      check(node, context) {
        if (node.kind !== "Parameter") return;

        context.report(
          `saw parameter ${(node as AST.Parameter).name}`,
          node,
          undefined,
          "T001",
        );
      },
    };

    const errors = new Linter([rule]).lint(functionWithParameter("value"));

    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error).toBeDefined();
    expect(error!.code).toBe("T001");
    expect(error!.message).toContain("saw parameter value");
  });

  test("visits typed block statements using the AST Block kind", () => {
    const rule: LintRule = {
      code: "T002",
      name: "block-visitor-test",
      check(node, context) {
        if (node.kind !== "VariableDecl") return;

        context.report("saw variable declaration", node, undefined, "T002");
      },
    };

    const errors = new Linter([rule]).lint(
      functionWithBodyStatement({
        kind: "VariableDecl",
        isGlobal: false,
        isConst: false,
        name: "local",
        typeAnnotation: intType,
        location,
      }),
    );

    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error).toBeDefined();
    expect(error!.code).toBe("T002");
  });
});
