import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

import * as AST from "../compiler/common/AST";
import { Token } from "../compiler/frontend/Token";
import { TokenType } from "../compiler/frontend/TokenType";
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

const equalToken = new Token(
  TokenType.Equal,
  "=",
  null,
  location.startLine,
  location.startColumn,
  location.file,
);

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

function functionWithExpression(expression: AST.Expression): AST.Program {
  return functionWithBodyStatement(expressionStatement(expression));
}

function collectVisitedNames(expression: AST.Expression): string[] {
  const rule: LintRule = {
    code: "TEXPR",
    name: "expression-child-visitor-test",
    check(node, context) {
      if (node.kind === "Identifier") {
        context.report(
          `identifier:${(node as AST.IdentifierExpr).name}`,
          node,
          undefined,
          "TEXPR",
        );
      } else if (node.kind === "LambdaParameter") {
        context.report(
          `lambda-param:${(node as AST.LambdaParameter).name}`,
          node,
          undefined,
          "TEXPR",
        );
      }
    },
  };

  return new Linter([rule])
    .lint(functionWithExpression(expression))
    .map((error) => error.message);
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

  test("visits aggregate expression children", () => {
    const messages = collectVisitedNames({
      kind: "ArrayLiteral",
      elements: [
        {
          kind: "Member",
          object: identifier("memberObject"),
          property: "field",
          location,
        },
        {
          kind: "Index",
          object: identifier("indexObject"),
          index: identifier("indexValue"),
          location,
        },
        {
          kind: "StructLiteral",
          structName: "Point",
          fields: [{ name: "x", value: identifier("fieldValue") }],
          location,
        },
        {
          kind: "TupleLiteral",
          elements: [identifier("tupleValue")],
          location,
        },
        {
          kind: "EnumStructVariant",
          enumName: "Result",
          variantName: "Ok",
          fields: [{ name: "value", value: identifier("enumField") }],
          location,
        },
        {
          kind: "InterpolatedString",
          parts: [identifier("interpolation")],
          location,
        },
      ],
      location,
    });

    expect(messages).toHaveLength(7);
    expect(messages).toContain("identifier:memberObject");
    expect(messages).toContain("identifier:indexObject");
    expect(messages).toContain("identifier:indexValue");
    expect(messages).toContain("identifier:fieldValue");
    expect(messages).toContain("identifier:tupleValue");
    expect(messages).toContain("identifier:enumField");
    expect(messages).toContain("identifier:interpolation");
  });

  test("visits operator and type expression children", () => {
    const messages = collectVisitedNames({
      kind: "ArrayLiteral",
      elements: [
        {
          kind: "Unary",
          operator: equalToken,
          operand: identifier("unaryOperand"),
          isPrefix: true,
          location,
        },
        {
          kind: "Assignment",
          assignee: identifier("assignmentTarget"),
          operator: equalToken,
          value: identifier("assignmentValue"),
          location,
        },
        {
          kind: "Ternary",
          condition: identifier("ternaryCondition"),
          trueExpr: identifier("ternaryTrue"),
          falseExpr: identifier("ternaryFalse"),
          location,
        },
        {
          kind: "Cast",
          targetType: intType,
          expression: identifier("castValue"),
          location,
        },
        {
          kind: "As",
          expression: identifier("asValue"),
          type: intType,
          location,
        },
        {
          kind: "Is",
          expression: identifier("isValue"),
          type: intType,
          location,
        },
        {
          kind: "GenericInstantiation",
          base: identifier("genericBase"),
          genericArgs: [intType],
          location,
        },
      ],
      location,
    });

    expect(messages).toHaveLength(10);
    expect(messages).toContain("identifier:unaryOperand");
    expect(messages).toContain("identifier:assignmentTarget");
    expect(messages).toContain("identifier:assignmentValue");
    expect(messages).toContain("identifier:ternaryCondition");
    expect(messages).toContain("identifier:ternaryTrue");
    expect(messages).toContain("identifier:ternaryFalse");
    expect(messages).toContain("identifier:castValue");
    expect(messages).toContain("identifier:asValue");
    expect(messages).toContain("identifier:isValue");
    expect(messages).toContain("identifier:genericBase");
  });

  test("visits lambda and match expression children", () => {
    const messages = collectVisitedNames({
      kind: "ArrayLiteral",
      elements: [
        {
          kind: "LambdaExpression",
          params: [
            {
              kind: "LambdaParameter",
              name: "lambdaArg",
              type: intType,
              location,
            },
          ],
          returnType: intType,
          body: {
            kind: "Block",
            statements: [expressionStatement(identifier("lambdaBody"))],
            location,
          },
          location,
        },
        {
          kind: "Match",
          value: identifier("matchValue"),
          arms: [
            {
              kind: "MatchArm",
              pattern: {
                kind: "PatternWildcard",
                location,
              },
              guard: identifier("matchGuard"),
              body: identifier("matchBody"),
              location,
            },
          ],
          location,
        },
      ],
      location,
    });

    expect(messages).toHaveLength(5);
    expect(messages).toContain("lambda-param:lambdaArg");
    expect(messages).toContain("identifier:lambdaBody");
    expect(messages).toContain("identifier:matchValue");
    expect(messages).toContain("identifier:matchGuard");
    expect(messages).toContain("identifier:matchBody");
  });
});
