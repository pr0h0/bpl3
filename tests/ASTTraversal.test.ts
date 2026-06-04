import { describe, expect, it } from "bun:test";

import { walkAST } from "../compiler/common/ASTTraversal";

import type { SourceLocation } from "../compiler/common/CompilerError";

const location: SourceLocation = {
  file: "ast-traversal-test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

describe("AST traversal", () => {
  it("walks AST nodes stored inside literal field wrapper objects", () => {
    const structLiteral = {
      kind: "StructLiteral",
      structName: "Box",
      genericArgs: [],
      fields: [
        {
          name: "value",
          value: {
            kind: "EnumStructVariant",
            enumName: "Visit",
            variantName: "Pair",
            fields: [
              {
                name: "left",
                value: {
                  kind: "Call",
                  callee: {
                    kind: "Identifier",
                    name: "fib",
                    location,
                  },
                  args: [
                    {
                      kind: "Literal",
                      value: 5,
                      raw: "5",
                      type: "number",
                      location,
                    },
                  ],
                  genericArgs: [],
                  location,
                },
              },
            ],
            location,
          },
        },
      ],
      location,
    };
    const visitedKinds: string[] = [];

    walkAST(structLiteral, (node) => {
      visitedKinds.push(node.kind);
    });

    expect(visitedKinds).toContain("StructLiteral");
    expect(visitedKinds).toContain("EnumStructVariant");
    expect(visitedKinds).toContain("Call");
    expect(visitedKinds).toContain("Identifier");
    expect(visitedKinds).toContain("Literal");
  });

  it("does not recurse through semantic overload metadata wrappers", () => {
    const binaryExpression = {
      kind: "Binary",
      left: {
        kind: "Literal",
        value: 1,
        raw: "1",
        type: "number",
        location,
      },
      operator: {
        type: "Plus",
        lexeme: "+",
        literal: null,
        line: 1,
        column: 2,
        file: location.file,
      },
      right: {
        kind: "Literal",
        value: 2,
        raw: "2",
        type: "number",
        location,
      },
      operatorOverload: {
        methodDeclaration: {
          kind: "FunctionDecl",
          name: "hidden",
          genericParams: [],
          params: [],
          returnType: {
            kind: "BasicType",
            name: "int",
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location,
          },
          body: {
            kind: "Block",
            statements: [],
            location,
          },
          location,
        },
      },
      location,
    };
    const visitedKinds: string[] = [];

    walkAST(binaryExpression, (node) => {
      visitedKinds.push(node.kind);
    });

    expect(visitedKinds).toContain("Binary");
    expect(visitedKinds).toContain("Literal");
    expect(visitedKinds).not.toContain("FunctionDecl");
  });
});
