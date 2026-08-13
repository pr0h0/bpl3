import { describe, expect, it } from "bun:test";

import {
  collectIdentifiers,
  findNodeAtPosition,
  getChildren,
  walkAST,
} from "../compiler/common/ASTTraversal";

import type { SourceLocation } from "../compiler/common/CompilerError";

const location: SourceLocation = {
  file: "ast-traversal-test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

function loc(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceLocation {
  return {
    file: location.file,
    startLine,
    startColumn,
    endLine,
    endColumn,
  };
}

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

  it("collects identifier expression nodes", () => {
    const expression = {
      kind: "Binary",
      left: {
        kind: "Identifier",
        name: "left",
        location,
      },
      operator: {
        type: "Plus",
        lexeme: "+",
        literal: null,
        line: 1,
        column: 6,
        file: location.file,
      },
      right: {
        kind: "Identifier",
        name: "right",
        location,
      },
      location,
    };

    const identifiers = collectIdentifiers(expression);

    expect(identifiers.map((identifier) => identifier.name)).toEqual([
      "left",
      "right",
    ]);
  });

  it("finds positioned nodes inside literal field wrapper objects", () => {
    const structLiteral = {
      kind: "StructLiteral",
      structName: "Box",
      genericArgs: [],
      fields: [
        {
          name: "value",
          value: {
            kind: "Call",
            callee: {
              kind: "Identifier",
              name: "make",
              location: loc(1, 15, 1, 19),
            },
            args: [],
            genericArgs: [],
            location: loc(1, 15, 1, 21),
          },
        },
      ],
      location: loc(1, 1, 1, 22),
    };

    const path = findNodeAtPosition(structLiteral, 1, 16);

    expect(path.map((node) => node.kind)).toEqual([
      "StructLiteral",
      "Call",
      "Identifier",
    ]);
  });

  it("returns direct AST children stored inside wrapper objects", () => {
    const structLiteral = {
      kind: "StructLiteral",
      structName: "Box",
      genericArgs: [],
      fields: [
        {
          name: "value",
          value: {
            kind: "Call",
            callee: {
              kind: "Identifier",
              name: "make",
              location: loc(1, 15, 1, 19),
            },
            args: [],
            genericArgs: [],
            location: loc(1, 15, 1, 21),
          },
        },
      ],
      location: loc(1, 1, 1, 22),
    };

    const children = getChildren(structLiteral);

    expect(children.map((node) => node.kind)).toEqual(["Call"]);
  });
});
