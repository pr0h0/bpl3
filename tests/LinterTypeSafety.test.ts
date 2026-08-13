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

function basicType(name: string): AST.BasicTypeNode {
  return {
    kind: "BasicType",
    name,
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location,
  };
}

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
  return functionWithBodyStatements([statement]);
}

function functionWithBodyStatements(statements: AST.Statement[]): AST.Program {
  const program = functionWithParameter("value");
  const [func] = program.statements as [AST.FunctionDecl];
  func.body.statements.push(...statements);
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

function collectVisitedNamesInStatements(statements: AST.Statement[]): string[] {
  const rule: LintRule = {
    code: "TSTMT",
    name: "statement-child-visitor-test",
    check(node, context) {
      if (node.kind !== "Identifier") return;

      context.report(
        `identifier:${(node as AST.IdentifierExpr).name}`,
        node,
        undefined,
        "TSTMT",
      );
    },
  };

  return new Linter([rule])
    .lint(functionWithBodyStatements(statements))
    .map((error) => error.message);
}

function extractLinterSwitchCases(): Set<string> {
  const source = readFileSync("compiler/linter/Linter.ts", "utf8");
  const cases: string[] = [];
  for (const match of source.matchAll(/case "([^"]+)":/g)) {
    if (match[1]) cases.push(match[1]);
  }
  return new Set(cases);
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

  test("keeps child-bearing linter visitor switch cases explicit", () => {
    const cases = extractLinterSwitchCases();
    const expectedKinds = [
      "Program",
      "FunctionDecl",
      "StructDecl",
      "StructField",
      "SpecDecl",
      "SpecMethod",
      "EnumDecl",
      "EnumVariant",
      "EnumVariantTuple",
      "EnumVariantStruct",
      "FunctionAttribute",
      "TypeAlias",
      "BasicType",
      "TupleType",
      "FunctionType",
      "LambdaType",
      "MetaType",
      "Block",
      "If",
      "Loop",
      "Return",
      "Throw",
      "Try",
      "CatchClause",
      "Switch",
      "Case",
      "Defer",
      "ExpressionStmt",
      "Parameter",
      "VariableDecl",
      "Extern",
      "InterpolatedString",
      "Binary",
      "Unary",
      "Call",
      "Member",
      "Index",
      "ArrayLiteral",
      "StructLiteral",
      "TupleLiteral",
      "EnumStructVariant",
      "Cast",
      "Sizeof",
      "TypeOf",
      "OffsetOf",
      "TypeMatch",
      "Match",
      "MatchArm",
      "PatternLiteral",
      "PatternIdentifier",
      "PatternTuple",
      "PatternEnum",
      "PatternEnumTuple",
      "PatternEnumStruct",
      "Assignment",
      "Ternary",
      "GenericInstantiation",
      "LambdaExpression",
      "LambdaParameter",
      "Is",
      "As",
      "Group",
    ];

    for (const kind of expectedKinds) {
      expect(cases).toContain(kind);
    }
    expect(cases).not.toContain("BlockStmt");
  });

  test("documents intentionally non-recursive linter AST leaves", () => {
    expect([
      "Asm",
      "AutoDestroy",
      "Break",
      "Continue",
      "Export",
      "Fallthrough",
      "Identifier",
      "Import",
      "Literal",
      "PatternWildcard",
      "RuntimeDeferCleanup",
    ]).toEqual([
      "Asm",
      "AutoDestroy",
      "Break",
      "Continue",
      "Export",
      "Fallthrough",
      "Identifier",
      "Import",
      "Literal",
      "PatternWildcard",
      "RuntimeDeferCleanup",
    ]);
  });

  test("visits throw, try, catch, switch, and case children", () => {
    const messages = collectVisitedNamesInStatements([
      {
        kind: "Throw",
        expression: identifier("throwValue"),
        location,
      },
      {
        kind: "Try",
        tryBlock: {
          kind: "Block",
          statements: [expressionStatement(identifier("tryBody"))],
          location,
        },
        catchClauses: [
          {
            kind: "CatchClause",
            variable: "error",
            type: intType,
            body: {
              kind: "Block",
              statements: [expressionStatement(identifier("catchBody"))],
              location,
            },
            location,
          },
        ],
        location,
      },
      {
        kind: "Switch",
        expression: identifier("switchValue"),
        cases: [
          {
            kind: "Case",
            value: identifier("caseValue"),
            body: {
              kind: "Block",
              statements: [expressionStatement(identifier("caseBody"))],
              location,
            },
            location,
          },
        ],
        defaultCase: {
          kind: "Block",
          statements: [expressionStatement(identifier("defaultBody"))],
          location,
        },
        location,
      },
    ]);

    expect(messages).toHaveLength(7);
    expect(messages).toContain("identifier:throwValue");
    expect(messages).toContain("identifier:tryBody");
    expect(messages).toContain("identifier:catchBody");
    expect(messages).toContain("identifier:switchValue");
    expect(messages).toContain("identifier:caseValue");
    expect(messages).toContain("identifier:caseBody");
    expect(messages).toContain("identifier:defaultBody");
  });

  test("visits declaration type children", () => {
    const rule: LintRule = {
      code: "TTYPE",
      name: "declaration-type-visitor-test",
      check(node, context) {
        if (node.kind !== "BasicType") return;

        context.report(
          `type:${(node as AST.BasicTypeNode).name}`,
          node,
          undefined,
          "TTYPE",
        );
      },
    };

    const program: AST.Program = {
      kind: "Program",
      location,
      statements: [
        {
          kind: "TypeAlias",
          name: "Alias",
          genericParams: [],
          type: basicType("aliasType"),
          location,
        },
        {
          kind: "StructDecl",
          name: "Container",
          genericParams: [],
          inheritanceList: [basicType("baseStruct")],
          members: [
            {
              kind: "StructField",
              name: "field",
              type: basicType("fieldType"),
              location,
            },
          ],
          location,
        },
        {
          kind: "SpecDecl",
          name: "Callable",
          genericParams: [],
          extends: [basicType("baseSpec")],
          methods: [
            {
              kind: "SpecMethod",
              name: "call",
              genericParams: [],
              params: [
                {
                  kind: "Parameter",
                  name: "specParam",
                  type: basicType("specParamType"),
                  location,
                },
              ],
              returnType: basicType("specReturnType"),
              location,
            },
          ],
          location,
        },
        {
          kind: "FunctionDecl",
          isFrame: true,
          isStatic: true,
          name: "main",
          attributes: [
            {
              kind: "FunctionAttribute",
              name: "noreturn",
              location,
            },
          ],
          genericParams: [],
          params: [
            {
              kind: "Parameter",
              name: "param",
              type: basicType("paramType"),
              location,
            },
          ],
          returnType: basicType("returnType"),
          body: {
            kind: "Block",
            statements: [variableDecl("localValue")],
            location,
          },
          location,
        },
        {
          kind: "Extern",
          name: "nativeCall",
          params: [{ name: "input", type: basicType("externParam") }],
          isVariadic: false,
          returnType: basicType("externReturn"),
          location,
        },
      ],
    };

    const messages = new Linter([rule])
      .lint(program)
      .map((error) => error.message);

    expect(messages).toContain("type:aliasType");
    expect(messages).toContain("type:baseStruct");
    expect(messages).toContain("type:fieldType");
    expect(messages).toContain("type:baseSpec");
    expect(messages).toContain("type:specParamType");
    expect(messages).toContain("type:specReturnType");
    expect(messages).toContain("type:paramType");
    expect(messages).toContain("type:returnType");
    expect(messages).toContain("type:int");
    expect(messages).toContain("type:externParam");
    expect(messages).toContain("type:externReturn");
  });

  test("visits function attributes", () => {
    const rule: LintRule = {
      code: "TATTR",
      name: "function-attribute-visitor-test",
      check(node, context) {
        if (node.kind !== "FunctionAttribute") return;

        context.report(
          `attribute:${(node as AST.FunctionAttribute).name}`,
          node,
          undefined,
          "TATTR",
        );
      },
    };

    const program = functionWithParameter("value");
    const [func] = program.statements as [AST.FunctionDecl];
    func.attributes.push({
      kind: "FunctionAttribute",
      name: "noreturn",
      location,
    });

    expect(new Linter([rule]).lint(program).map((error) => error.message)).toEqual(
      ["attribute:noreturn"],
    );
  });

  test("visits nested type children", () => {
    const rule: LintRule = {
      code: "TNEST",
      name: "nested-type-visitor-test",
      check(node, context) {
        if (node.kind !== "BasicType") return;

        context.report(
          `type:${(node as AST.BasicTypeNode).name}`,
          node,
          undefined,
          "TNEST",
        );
      },
    };

    const nestedType: AST.TypeNode = {
      kind: "FunctionType",
      returnType: {
        kind: "TupleType",
        types: [basicType("tupleElement")],
        location,
      },
      paramTypes: [
        {
          kind: "BasicType",
          name: "Box",
          genericArgs: [basicType("genericArg")],
          pointerDepth: 0,
          arrayDimensions: [],
          location,
        },
        {
          kind: "LambdaType",
          returnType: basicType("lambdaReturn"),
          paramTypes: [
            {
              kind: "MetaType",
              type: basicType("metaInner"),
              location,
            },
          ],
          location,
        },
      ],
      location,
    };

    const program: AST.Program = {
      kind: "Program",
      location,
      statements: [
        {
          kind: "TypeAlias",
          name: "Nested",
          genericParams: [],
          type: nestedType,
          location,
        },
      ],
    };

    const messages = new Linter([rule])
      .lint(program)
      .map((error) => error.message);

    expect(messages).toContain("type:tupleElement");
    expect(messages).toContain("type:Box");
    expect(messages).toContain("type:genericArg");
    expect(messages).toContain("type:lambdaReturn");
    expect(messages).toContain("type:metaInner");
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

  test("visits expression type children", () => {
    const rule: LintRule = {
      code: "TEXPRTYPE",
      name: "expression-type-visitor-test",
      check(node, context) {
        if (node.kind !== "BasicType") return;

        context.report(
          `type:${(node as AST.BasicTypeNode).name}`,
          node,
          undefined,
          "TEXPRTYPE",
        );
      },
    };

    const errors = new Linter([rule]).lint(
      functionWithExpression({
        kind: "ArrayLiteral",
        elements: [
          {
            kind: "Cast",
            targetType: basicType("castTarget"),
            expression: identifier("castValue"),
            location,
          },
          {
            kind: "Sizeof",
            target: basicType("sizeofTarget"),
            location,
          },
          {
            kind: "TypeOf",
            target: basicType("typeOfTarget"),
            location,
          },
          {
            kind: "OffsetOf",
            targetType: basicType("offsetTarget"),
            member: "field",
            location,
          },
          {
            kind: "TypeMatch",
            targetType: basicType("typeMatchTarget"),
            value: identifier("typeMatchValue"),
            location,
          },
          {
            kind: "GenericInstantiation",
            base: identifier("genericBase"),
            genericArgs: [basicType("genericExprArg")],
            location,
          },
          {
            kind: "LambdaExpression",
            params: [
              {
                kind: "LambdaParameter",
                name: "lambdaArg",
                type: basicType("lambdaParamType"),
                location,
              },
            ],
            returnType: basicType("lambdaReturnType"),
            body: {
              kind: "Block",
              statements: [],
              location,
            },
            location,
          },
        ],
        location,
      }),
    );

    const messages = errors.map((error) => error.message);
    expect(messages).toContain("type:castTarget");
    expect(messages).toContain("type:sizeofTarget");
    expect(messages).toContain("type:typeOfTarget");
    expect(messages).toContain("type:offsetTarget");
    expect(messages).toContain("type:typeMatchTarget");
    expect(messages).toContain("type:genericExprArg");
    expect(messages).toContain("type:lambdaParamType");
    expect(messages).toContain("type:lambdaReturnType");
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

  test("visits pattern type and binding children", () => {
    const rule: LintRule = {
      code: "TPAT",
      name: "pattern-binding-visitor-test",
      check(node, context) {
        if (node.kind === "VariableDecl") {
          context.report(
            `variable:${(node as AST.VariableDecl).name}`,
            node,
            undefined,
            "TPAT",
          );
        } else if (node.kind === "BasicType") {
          context.report(
            `type:${(node as AST.BasicTypeNode).name}`,
            node,
            undefined,
            "TPAT",
          );
        }
      },
    };

    const bindingDeclaration = variableDecl("fieldBinding");
    const identifierBinding = variableDecl("identifierBinding");
    const errors = new Linter([rule]).lint(
      functionWithExpression({
        kind: "Match",
        value: identifier("matchValue"),
        arms: [
          {
            kind: "MatchArm",
            pattern: {
              kind: "PatternIdentifier",
              name: "typedBinding",
              type: basicType("patternIdentifierType"),
              bindingDeclaration: identifierBinding,
              location,
            },
            body: identifier("identifierBody"),
            location,
          },
          {
            kind: "MatchArm",
            pattern: {
              kind: "PatternEnum",
              enumName: "Result",
              variantName: "None",
              genericArgs: [basicType("patternEnumGeneric")],
              location,
            },
            body: identifier("enumBody"),
            location,
          },
          {
            kind: "MatchArm",
            pattern: {
              kind: "PatternEnumTuple",
              enumName: "Result",
              variantName: "Ok",
              genericArgs: [basicType("patternTupleGeneric")],
              bindings: [],
              location,
            },
            body: identifier("tupleBody"),
            location,
          },
          {
            kind: "MatchArm",
            pattern: {
              kind: "PatternEnumStruct",
              enumName: "Result",
              variantName: "Ok",
              genericArgs: [basicType("patternStructGeneric")],
              fields: [
                {
                  fieldName: "value",
                  binding: "fieldBinding",
                  bindingDeclaration,
                },
              ],
              location,
            },
            body: identifier("matchBody"),
            location,
          },
        ],
        location,
      }),
    );

    const messages = errors.map((error) => error.message);
    expect(messages).toContain("type:patternIdentifierType");
    expect(messages).toContain("variable:identifierBinding");
    expect(messages).toContain("type:patternEnumGeneric");
    expect(messages).toContain("type:patternTupleGeneric");
    expect(messages).toContain("type:patternStructGeneric");
    expect(messages).toContain("variable:fieldBinding");
  });
});
