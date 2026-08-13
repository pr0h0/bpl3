import { describe, expect, test } from "bun:test";

import { Formatter } from "../compiler/formatter/Formatter";

const location = {
  file: "test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

describe("Formatter error handling", () => {
  test("throws on unsupported statement kinds", () => {
    const formatter = new Formatter();

    expect(() =>
      formatter.format({
        kind: "Program",
        statements: [{ kind: "MysteryStatement", location }],
        comments: [],
      } as any),
    ).toThrow("Unsupported statement kind in formatter: MysteryStatement");
  });

  test("throws on unsupported expression kinds", () => {
    const formatter = new Formatter();

    expect(() =>
      formatter.format({
        kind: "Program",
        statements: [
          {
            kind: "ExpressionStmt",
            expression: { kind: "MysteryExpression" },
            location,
          },
        ],
        comments: [],
      } as any),
    ).toThrow("Unsupported expression kind in formatter: MysteryExpression");
  });

  test("throws on unsupported type kinds", () => {
    const formatter = new Formatter();

    expect(() =>
      formatter.format({
        kind: "Program",
        statements: [
          {
            kind: "TypeAlias",
            name: "Alias",
            genericParams: [],
            type: { kind: "MysteryType" },
            location,
          },
        ],
        comments: [],
      } as any),
    ).toThrow("Unsupported type kind in formatter: MysteryType");
  });

  test("throws on unsupported pattern kinds", () => {
    const formatter = new Formatter();

    expect(() =>
      formatter.format({
        kind: "Program",
        statements: [
          {
            kind: "ExpressionStmt",
            expression: {
              kind: "Match",
              value: { kind: "Identifier", name: "value" },
              arms: [
                {
                  pattern: { kind: "MysteryPattern" },
                  body: { kind: "Literal", value: 1, literalType: "integer" },
                  location,
                },
              ],
              location,
            },
            location,
          },
        ],
        comments: [],
      } as any),
    ).toThrow("Unsupported pattern kind in formatter: MysteryPattern");
  });
});
