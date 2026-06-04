import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
  SymbolTable,
  type Symbol,
} from "../compiler/middleend/SymbolTable";

const dummyLocation = {
  file: "symbol-table-test.bpl",
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

describe("SymbolTable", () => {
  it("keeps parent scope resolution iterative on the hot path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const resolveStart = source.indexOf("  public resolve(");
    const nextMethodStart = source.indexOf("  public getUnusedVariables", resolveStart);

    expect(resolveStart).toBeGreaterThanOrEqual(0);
    expect(nextMethodStart).toBeGreaterThan(resolveStart);
    expect(source.slice(resolveStart, nextMethodStart)).not.toContain(
      ".parent.resolve(",
    );
  });

  it("resolves root symbols through very deep scope chains without overflowing", () => {
    const root = new SymbolTable();
    const symbol: Symbol = {
      name: "root_value",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    root.define(symbol);

    let scope = root;
    for (let i = 0; i < 50_000; i++) {
      scope = scope.enterScope();
    }

    expect(scope.resolve("root_value")).toBe(symbol);
    expect(symbol.used).toBe(true);
  });
});
