import { expect, test } from "bun:test";
import type * as AST from "../compiler/common/AST";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { lowerImplicitConversion } from "../compiler/middleend/lowering/ImplicitConversions";

function nominal(source: string, file: string): AST.BasicTypeNode {
  const declaration = new Parser(source, file).parse().statements[0]!;
  if (
    declaration.kind !== "StructDecl" &&
    declaration.kind !== "EnumDecl" &&
    declaration.kind !== "SpecDecl"
  )
    throw new Error("Expected nominal declaration");
  return {
    kind: "BasicType",
    name: "Token",
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: declaration.location,
    resolvedDeclaration: declaration,
  };
}

const wrappers: [
  string,
  (type: AST.BasicTypeNode, dimensions: (number | null)[]) => AST.TypeNode,
][] = [
  ["elements", (type, arrayDimensions) => ({ ...type, arrayDimensions })],
  [
    "pointer elements",
    (type, arrayDimensions) => ({ ...type, pointerDepth: 1, arrayDimensions }),
  ],
  [
    "generic elements",
    (type, arrayDimensions) => ({
      ...type,
      name: "Box",
      resolvedDeclaration: undefined,
      genericArgs: [type],
      arrayDimensions,
    }),
  ],
  [
    "tuple elements",
    (type, arrayDimensions) => ({
      kind: "TupleType",
      types: [type],
      arrayDimensions,
      location: type.location,
    }),
  ],
  [
    "callback results",
    (type, arrayDimensions) => ({
      kind: "FunctionType",
      returnType: type,
      paramTypes: [],
      arrayDimensions,
      location: type.location,
    }),
  ],
  [
    "callback parameters",
    (type, arrayDimensions) => ({
      kind: "FunctionType",
      returnType: { ...type, name: "void", resolvedDeclaration: undefined },
      paramTypes: [type],
      arrayDimensions,
      location: type.location,
    }),
  ],
  [
    "closure elements",
    (type, arrayDimensions) => ({
      kind: "LambdaType",
      returnType: type,
      paramTypes: [type],
      arrayDimensions,
      location: type.location,
    }),
  ],
];

for (const declaration of [
  "struct Token{value:int,}",
  "enum Token{Value,}",
  "spec Token{}",
]) {
  for (const [name, wrap] of wrappers) {
    for (const dimensions of [[2], [null]]) {
      test(`array casts preserve nominal identity for ${declaration} in ${name} to [${dimensions}]`, () => {
        const sourceType = nominal(declaration, "module-a.bpl");
        const source = wrap(sourceType, [2]);
        const different = wrap(
          nominal(declaration, "module-b.bpl"),
          dimensions,
        );
        const same = wrap(nominal(declaration, "module-a.bpl"), dimensions);
        const checker = new TypeChecker();
        expect(lowerImplicitConversion(different, source).kind).toBe(
          "unsupported",
        );
        expect(checker.isCastAllowed(source, different)).toBe(false);
        expect(lowerImplicitConversion(same, source).kind).toBe(
          dimensions[0] === null ? "array-to-slice" : "identity",
        );
        expect(checker.isCastAllowed(source, same)).toBe(true);
      });
    }
  }
  test(`array-to-pointer casts preserve nominal identity for ${declaration}`, () => {
    const source = {
      ...nominal(declaration, "module-a.bpl"),
      arrayDimensions: [2],
    };
    const different = {
      ...nominal(declaration, "module-b.bpl"),
      pointerDepth: 1,
    };
    const same = { ...nominal(declaration, "module-a.bpl"), pointerDepth: 1 };
    const checker = new TypeChecker();
    expect(lowerImplicitConversion(different, source).kind).toBe("unsupported");
    expect(checker.isCastAllowed(source, different)).toBe(false);
    expect(lowerImplicitConversion(same, source).kind).toBe("array-to-pointer");
    expect(checker.isCastAllowed(source, same)).toBe(true);
  });
}
