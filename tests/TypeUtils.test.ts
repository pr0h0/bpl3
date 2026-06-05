import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import type * as AST from "../compiler/common/AST";
import { TokenType } from "../compiler/frontend/TokenType";
import { TypeUtils } from "../compiler/middleend/TypeUtils";

const location = {
  file: "test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

function basicType(
  name: string,
  {
    pointerDepth = 0,
    arrayDimensions = [],
  }: {
    pointerDepth?: number;
    arrayDimensions?: (number | null)[];
  } = {},
): AST.BasicTypeNode {
  return {
    kind: "BasicType",
    name,
    genericArgs: [],
    pointerDepth,
    arrayDimensions,
    location,
  };
}

function methodSource(name: string, nextComment: string): string {
  const source = readFileSync(
    join(process.cwd(), "compiler/middleend/TypeUtils.ts"),
    "utf8",
  );
  const start = source.indexOf(`static ${name}`);
  const end = source.indexOf(nextComment, start);
  return source.slice(start, end);
}

describe("TypeUtils", () => {
  it("checks numeric basic type names without array membership probes", () => {
    for (const name of [
      "int",
      "uint",
      "float",
      "double",
      "bool",
      "i1",
      "char",
      "uchar",
      "short",
      "ushort",
      "long",
      "ulong",
      "i8",
      "u8",
      "i16",
      "u16",
      "i32",
      "u32",
      "i64",
      "u64",
    ]) {
      expect(TypeUtils.isNumericType(basicType(name))).toBe(true);
    }

    for (const name of ["string", "void", "Int", "usize"]) {
      expect(TypeUtils.isNumericType(basicType(name))).toBe(false);
    }

    expect(TypeUtils.isNumericType(basicType("int", { pointerDepth: 1 }))).toBe(
      false,
    );
    expect(
      TypeUtils.isNumericType(basicType("int", { arrayDimensions: [4] })),
    ).toBe(false);

    const implementation = methodSource(
      "isNumericType",
      "  /**\n   * Convert a type node",
    );

    expect(implementation).toContain("switch (type.name)");
    expect(implementation).not.toContain("NUMERIC_TYPES.includes");
    expect(implementation).not.toContain("TYPE_ALIASES");
  });

  it("checks comparison operators without allocating a lookup array", () => {
    const comparisonOperators = [
      TokenType.EqualEqual,
      TokenType.BangEqual,
      TokenType.Less,
      TokenType.LessEqual,
      TokenType.Greater,
      TokenType.GreaterEqual,
    ];

    for (const operator of comparisonOperators) {
      expect(TypeUtils.isComparisonOperator(operator)).toBe(true);
    }

    for (const operator of [
      TokenType.Plus,
      TokenType.Minus,
      TokenType.Star,
      TokenType.Slash,
      TokenType.Identifier,
    ]) {
      expect(TypeUtils.isComparisonOperator(operator)).toBe(false);
    }

    const implementation = methodSource(
      "isComparisonOperator",
      "  /**\n   * Check if a type is boolean",
    );

    expect(implementation).toContain("switch (op)");
    expect(implementation).not.toContain("return [");
    expect(implementation).not.toContain(".includes(");
  });
});
