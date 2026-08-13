import { describe, expect, it } from "bun:test";
import type * as AST from "../../../compiler/common/AST";
import { typeNodeToString } from "../services/utils";

const location = {
  file: "utils-test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

function basic(name: string): AST.BasicTypeNode {
  return {
    kind: "BasicType",
    name,
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location,
  };
}

describe("LSP utility type formatting", () => {
  it("renders lambda and metatype nodes", () => {
    const lambdaType: AST.LambdaTypeNode = {
      kind: "LambdaType",
      returnType: basic("int"),
      paramTypes: [basic("int"), basic("string")],
      location,
    };
    const metaType: AST.MetaType = {
      kind: "MetaType",
      type: lambdaType,
      location,
    };

    expect(typeNodeToString(lambdaType)).toBe("Lambda<int>(int, string)");
    expect(typeNodeToString(metaType)).toBe(
      "typeof<Lambda<int>(int, string)>",
    );
  });
});
