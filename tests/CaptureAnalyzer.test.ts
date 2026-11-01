import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import type * as AST from "../compiler/common/AST";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { CaptureAnalyzer } from "../compiler/middleend/CaptureAnalyzer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

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

// Type-checks a program in which each `_<Construct>` local is a lambda that
// reads a variable of `main` through that construct, and returns the names
// each lambda captured.
function capturesByLambda(): Map<string, string[]> {
  const file = join(
    import.meta.dir,
    "fixtures/capture-analysis/every_construct.bpl",
  );
  const source = readFileSync(file, "utf8");
  const program = new Parser(
    source,
    file,
    lexWithGrammar(source, file),
  ).parse();
  const checker = new TypeChecker();
  checker.checkProgram(program, file);
  expect(checker.getErrors().map((error) => error.message)).toEqual([]);

  const main = program.statements.find(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl" && statement.name === "main",
  )!;
  const captures = new Map<string, string[]>();
  for (const statement of main.body.statements) {
    if (statement.kind !== "VariableDecl") continue;
    const declaration = statement as AST.VariableDecl;
    const name = declaration.name;
    const lambda = declaration.initializer;
    if (
      typeof name !== "string" ||
      !name.startsWith("_") ||
      lambda?.kind !== "LambdaExpression"
    )
      continue;
    captures.set(
      name.slice(1),
      ((lambda as AST.LambdaExpr).capturedVariables ?? []).map((variable) =>
        String(variable.name),
      ),
    );
  }
  return captures;
}

describe("CaptureAnalyzer", () => {
  it("captures variables read through every expression and statement form", () => {
    const captures = capturesByLambda();
    const expected: Record<string, string> = {
      Identifier: "x",
      Binary: "x",
      Unary: "x",
      Call: "x",
      If: "x",
      Loop: "x",
      Defer: "x",
      Throw: "x",
      Try: "x",
      Switch: "x",
      ExpressionStmt: "x",
      Assignment: "x",
      Member: "p",
      Index: "arr",
      Cast: "x",
      Group: "x",
      Ternary: "x",
      ArrayLiteral: "x",
      StructLiteral: "x",
      TupleLiteral: "x",
      Sizeof: "x",
      Match: "shape",
      VariableDecl: "x",
      Block: "x",
      LambdaExpression: "x",
    };

    expect([...captures.keys()].sort()).toEqual(Object.keys(expected).sort());
    for (const [construct, variable] of Object.entries(expected)) {
      expect({ construct, captures: captures.get(construct) }).toEqual({
        construct,
        captures: [variable],
      });
    }
  });

  it("captures identifiers inside interpolated string parts", () => {
    const capturedDecl: AST.VariableDecl = {
      kind: "VariableDecl",
      isGlobal: false,
      isConst: false,
      name: "count",
      typeAnnotation: intType,
      location,
    };
    const lambda = lambdaReturning({
      kind: "InterpolatedString",
      parts: [
        {
          kind: "Identifier",
          name: "count",
          resolvedDeclaration: capturedDecl,
          location,
        },
      ],
      location,
    } as unknown as AST.Expression);

    expect(new CaptureAnalyzer(lambda).analyze()).toEqual([capturedDecl]);
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
