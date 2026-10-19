import { expect, test } from "bun:test";
import type * as AST from "../compiler/common/AST";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function annotation(source: string, name = "Token"): AST.BasicTypeNode {
  const file = "known-type-identity.bpl";
  const declaration = new Parser(
    source,
    file,
    lexWithGrammar(source, file),
  ).parse().statements[0]!;
  if (
    declaration.kind !== "StructDecl" &&
    declaration.kind !== "EnumDecl" &&
    declaration.kind !== "SpecDecl"
  ) {
    throw new Error("Expected a nominal type declaration");
  }
  return {
    kind: "BasicType",
    name,
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: declaration.location,
    resolvedDeclaration: declaration,
  };
}

for (const source of [
  "struct Token{value:int,}",
  "enum Token{Value,}",
  "spec Token{}",
]) {
  test(`preserves recorded declaration identity after qualification is removed: ${source}`, () => {
    const checker = new TypeChecker();
    expect(() => checker.ensureKnownType(annotation(source))).not.toThrow();
  });
}

for (const name of ["MissingType", "Token.Value"]) {
  test(`a recorded declaration cannot validate a different type name: ${name}`, () => {
    const checker = new TypeChecker();
    expect(() =>
      checker.ensureKnownType(annotation("enum Token{Value,}", name)),
    ).toThrow(`Undefined type '${name}'`);
  });
}
