import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

import type * as AST from "../compiler/common/AST";
import { CaptureAnalyzer } from "../compiler/middleend/CaptureAnalyzer";

const location = {
  file: "test.bpl",
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

const voidType: AST.BasicTypeNode = {
  kind: "BasicType",
  name: "void",
  genericArgs: [],
  pointerDepth: 0,
  arrayDimensions: [],
  location,
};

function lambdaReturning(value: AST.Expression): AST.LambdaExpr {
  return {
    kind: "LambdaExpression",
    params: [],
    returnType: voidType,
    body: {
      kind: "Block",
      statements: [
        {
          kind: "Return",
          value,
          location,
        },
      ],
      location,
    },
    location,
  };
}

function extractCaptureAnalyzerSwitchCases(): Set<string> {
  const source = readFileSync("compiler/middleend/CaptureAnalyzer.ts", "utf8");
  const cases: string[] = [];
  for (const match of source.matchAll(/case "([^"]+)":/g)) {
    if (match[1]) cases.push(match[1]);
  }
  return new Set(cases);
}

describe("CaptureAnalyzer", () => {
  it("keeps child-bearing capture visitor switch cases explicit", () => {
    const cases = extractCaptureAnalyzerSwitchCases();
    const expectedKinds = [
      "Identifier",
      "Block",
      "VariableDecl",
      "Return",
      "Binary",
      "Unary",
      "InterpolatedString",
      "Call",
      "If",
      "Loop",
      "Defer",
      "Throw",
      "Try",
      "Switch",
      "ExpressionStmt",
      "Assignment",
      "Member",
      "Index",
      "Cast",
      "Group",
      "Is",
      "As",
      "Ternary",
      "GenericInstantiation",
      "ArrayLiteral",
      "StructLiteral",
      "TupleLiteral",
      "EnumStructVariant",
      "Sizeof",
      "TypeOf",
      "OffsetOf",
      "TypeMatch",
      "Match",
      "LambdaExpression",
    ];

    for (const kind of expectedKinds) {
      expect(cases).toContain(kind);
    }
  });

  it("captures identifiers used as generic instantiation bases", () => {
    const capturedDecl: AST.VariableDecl = {
      kind: "VariableDecl",
      isGlobal: false,
      isConst: false,
      name: "factory",
      typeAnnotation: {
        kind: "FunctionType",
        returnType: intType,
        paramTypes: [],
        location,
      },
      location,
    };
    const lambda = lambdaReturning({
      kind: "GenericInstantiation",
      base: {
        kind: "Identifier",
        name: "factory",
        resolvedDeclaration: capturedDecl,
        location,
      },
      genericArgs: [intType],
      location,
    });

    const captures = new CaptureAnalyzer(lambda).analyze();

    expect(captures).toContain(capturedDecl);
  });
});
