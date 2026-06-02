import { describe, expect, it } from "bun:test";

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

describe("CaptureAnalyzer", () => {
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
