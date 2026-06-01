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

function identifier(name: string): AST.IdentifierExpr {
  return {
    kind: "Identifier",
    name,
    location,
  };
}

function expressionStatement(expression: AST.Expression): AST.ExpressionStmt {
  return {
    kind: "ExpressionStmt",
    expression,
    location,
  };
}

function variableDecl(name: string): AST.VariableDecl {
  return {
    kind: "VariableDecl",
    isGlobal: false,
    isConst: false,
    name,
    typeAnnotation: intType,
    location,
  };
}

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

  test("visits expressions contained by expression statements", () => {
    const rule: LintRule = {
      code: "T003",
      name: "expression-statement-visitor-test",
      check(node, context) {
        if (node.kind !== "Identifier") return;

        context.report(
          `saw identifier ${(node as AST.IdentifierExpr).name}`,
          node,
          undefined,
          "T003",
        );
      },
    };

    const errors = new Linter([rule]).lint(
      functionWithBodyStatement(expressionStatement(identifier("sideEffect"))),
    );

    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error).toBeDefined();
    expect(error!.message).toContain("saw identifier sideEffect");
  });

  test("visits statements contained by defer statements", () => {
    const rule: LintRule = {
      code: "T004",
      name: "defer-statement-visitor-test",
      check(node, context) {
        if (node.kind !== "Identifier") return;

        context.report(
          `saw deferred identifier ${(node as AST.IdentifierExpr).name}`,
          node,
          undefined,
          "T004",
        );
      },
    };

    const errors = new Linter([rule]).lint(
      functionWithBodyStatement({
        kind: "Defer",
        statement: expressionStatement(identifier("cleanup")),
        location,
      }),
    );

    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error).toBeDefined();
    expect(error!.message).toContain("saw deferred identifier cleanup");
  });

  test("visits loop init and step children", () => {
    const rule: LintRule = {
      code: "T005",
      name: "loop-child-visitor-test",
      check(node, context) {
        if (node.kind === "VariableDecl") {
          context.report(
            `saw variable ${(node as AST.VariableDecl).name}`,
            node,
            undefined,
            "T005",
          );
        } else if (node.kind === "Identifier") {
          context.report(
            `saw identifier ${(node as AST.IdentifierExpr).name}`,
            node,
            undefined,
            "T005",
          );
        }
      },
    };

    const errors = new Linter([rule]).lint(
      functionWithBodyStatement({
        kind: "Loop",
        init: variableDecl("loopInit"),
        step: identifier("loopStep"),
        body: {
          kind: "Block",
          statements: [],
          location,
        },
        location,
      }),
    );

    const messages = errors.map((error) => error.message);
    expect(messages).toHaveLength(2);
    expect(messages).toContain("saw variable loopInit");
    expect(messages).toContain("saw identifier loopStep");
  });
});
