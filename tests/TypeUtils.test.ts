import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { TokenType } from "../compiler/frontend/TokenType";
import { TypeUtils } from "../compiler/middleend/TypeUtils";

describe("TypeUtils", () => {
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

    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeUtils.ts"),
      "utf8",
    );
    const start = source.indexOf("static isComparisonOperator");
    const end = source.indexOf("  /**\n   * Check if a type is boolean", start);
    const implementation = source.slice(start, end);

    expect(implementation).toContain("switch (op)");
    expect(implementation).not.toContain("return [");
    expect(implementation).not.toContain(".includes(");
  });
});
