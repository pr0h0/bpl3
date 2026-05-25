import { describe, expect, it } from "bun:test";

import * as AST from "../compiler/common/AST";
import {
  areArrayDimensionsAssignable,
  lowerImplicitConversion,
} from "../compiler/middleend/lowering/ImplicitConversions";

const loc = {
  file: "lowering_test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

function basic(
  name: string,
  options: {
    pointerDepth?: number;
    arrayDimensions?: (number | null)[];
    genericArgs?: AST.TypeNode[];
  } = {},
): AST.BasicTypeNode {
  return {
    kind: "BasicType",
    name,
    genericArgs: options.genericArgs ?? [],
    pointerDepth: options.pointerDepth ?? 0,
    arrayDimensions: options.arrayDimensions ?? [],
    location: loc,
  };
}

function func(
  returnType: AST.TypeNode,
  paramTypes: AST.TypeNode[],
): AST.FunctionTypeNode {
  return {
    kind: "FunctionType",
    returnType,
    paramTypes,
    isVariadic: false,
    location: loc,
  };
}

function lambda(
  returnType: AST.TypeNode,
  paramTypes: AST.TypeNode[],
): AST.LambdaTypeNode {
  return {
    kind: "LambdaType",
    returnType,
    paramTypes,
    isVariadic: false,
    location: loc,
  };
}

describe("Incremental implicit conversion lowering", () => {
  it("classifies exact type matches as identity conversions", () => {
    const conversion = lowerImplicitConversion(basic("int"), basic("int"));

    expect(conversion.kind).toBe("identity");
  });

  it("BUG-141: classifies scalar integer aliases as integer-compatible conversions", () => {
    const conversion = lowerImplicitConversion(basic("long"), basic("int"));

    expect(conversion.kind).toBe("integer-compatible");
  });

  it("does not treat pointers to integer aliases as integer-compatible", () => {
    const conversion = lowerImplicitConversion(
      basic("long", { pointerDepth: 1 }),
      basic("int", { pointerDepth: 1 }),
    );

    expect(conversion.kind).toBe("unsupported");
  });

  it("classifies fixed array to slice as an array-to-slice conversion", () => {
    const conversion = lowerImplicitConversion(
      basic("int", { arrayDimensions: [null] }),
      basic("int", { arrayDimensions: [3] }),
    );

    expect(conversion.kind).toBe("array-to-slice");
  });

  it("classifies nested fixed arrays to an outer dynamic slice", () => {
    const conversion = lowerImplicitConversion(
      basic("int", { arrayDimensions: [null, 2] }),
      basic("int", { arrayDimensions: [4, 2] }),
    );

    expect(conversion.kind).toBe("array-to-slice");
  });

  it("preserves generic element identity for array-to-slice conversions", () => {
    const boxOfInt = basic("Box", { genericArgs: [basic("int")] });
    const boxOfUint = basic("Box", { genericArgs: [basic("uint")] });

    const matching = lowerImplicitConversion(
      basic("Box", {
        arrayDimensions: [null],
        genericArgs: [basic("int")],
      }),
      basic("Box", {
        arrayDimensions: [2],
        genericArgs: [boxOfInt.genericArgs[0]!],
      }),
    );
    const mismatched = lowerImplicitConversion(
      basic("Box", {
        arrayDimensions: [null],
        genericArgs: [boxOfUint.genericArgs[0]!],
      }),
      basic("Box", {
        arrayDimensions: [2],
        genericArgs: [boxOfInt.genericArgs[0]!],
      }),
    );

    expect(matching.kind).toBe("array-to-slice");
    expect(mismatched.kind).toBe("unsupported");
  });

  it("classifies fixed array to pointer as array-to-pointer decay", () => {
    const conversion = lowerImplicitConversion(
      basic("int", { pointerDepth: 1 }),
      basic("int", { arrayDimensions: [3] }),
    );

    expect(conversion.kind).toBe("array-to-pointer");
  });

  it("requires matching inner dimensions for array-to-pointer decay", () => {
    const matching = lowerImplicitConversion(
      basic("int", { pointerDepth: 1, arrayDimensions: [2] }),
      basic("int", { arrayDimensions: [4, 2] }),
    );
    const mismatched = lowerImplicitConversion(
      basic("int", { pointerDepth: 1, arrayDimensions: [3] }),
      basic("int", { arrayDimensions: [4, 2] }),
    );

    expect(matching.kind).toBe("array-to-pointer");
    expect(mismatched.kind).toBe("unsupported");
  });

  it("rejects slice to pointer as an implicit conversion", () => {
    const conversion = lowerImplicitConversion(
      basic("int", { pointerDepth: 1 }),
      basic("int", { arrayDimensions: [null] }),
    );

    expect(conversion.kind).toBe("unsupported");
  });

  it("rejects slice to fixed array as an implicit conversion", () => {
    const conversion = lowerImplicitConversion(
      basic("int", { arrayDimensions: [3] }),
      basic("int", { arrayDimensions: [null] }),
    );

    expect(conversion.kind).toBe("unsupported");
  });

  it("allows dynamic target dimensions to accept fixed source dimensions", () => {
    expect(areArrayDimensionsAssignable([null], [3])).toBe(true);
    expect(areArrayDimensionsAssignable([null, 4], [3, 4])).toBe(true);
    expect(areArrayDimensionsAssignable([null, 4], [3, 5])).toBe(false);
    expect(areArrayDimensionsAssignable([3], [null])).toBe(false);
  });

  it("keeps Func and Lambda callable identities separate", () => {
    const intToIntFunc = func(basic("int"), [basic("int")]);
    const matchingFunc = func(basic("int"), [basic("int")]);
    const intToIntLambda = lambda(basic("int"), [basic("int")]);

    expect(lowerImplicitConversion(intToIntFunc, matchingFunc).kind).toBe(
      "identity",
    );
    expect(lowerImplicitConversion(intToIntFunc, intToIntLambda).kind).toBe(
      "unsupported",
    );
  });
});
