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
  it("keeps hierarchical resolution cache invalidated through child scopes", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const resolveStart = source.indexOf("  public resolve(");
    const nextMethodStart = source.indexOf(
      "  public getUnusedVariables",
      resolveStart,
    );

    expect(resolveStart).toBeGreaterThanOrEqual(0);
    expect(nextMethodStart).toBeGreaterThan(resolveStart);

    const resolveSource = source.slice(resolveStart, nextMethodStart);
    expect(source).toContain("const UNRESOLVED_SYMBOL");
    expect(source).toContain("private resolutionCache");
    expect(source).toContain("private childScopes");
    expect(source).toContain("private invalidateResolutionCache");
    expect(source).toContain("child.invalidateResolutionCache()");
    expect(resolveSource).toContain("this.resolutionCache");
    expect(resolveSource).toContain("UNRESOLVED_SYMBOL");
  });

  it("invalidates cached child misses when parent scopes define later symbols", () => {
    const root = new SymbolTable();
    const child = root.enterScope();

    expect(child.resolve("late_value")).toBeUndefined();

    const symbol: Symbol = {
      name: "late_value",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    root.define(symbol);

    expect(child.resolve("late_value")).toBe(symbol);
    expect(symbol.used).toBe(true);
  });

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

  it("marks only variable symbols as used during resolution", () => {
    const scope = new SymbolTable();
    const variable: Symbol = {
      name: "value",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    const functionSymbol: Symbol = {
      name: "helper",
      kind: "Function",
      declaration: {
        kind: "FunctionDecl",
        location: dummyLocation,
      },
      used: false,
    };

    scope.define(variable);
    scope.define(functionSymbol);

    expect(scope.resolve("value")).toBe(variable);
    expect(scope.resolve("helper")).toBe(functionSymbol);
    expect(variable.used).toBe(true);
    expect(functionSymbol.used).toBe(false);
  });

  it("keeps repeated variable resolution off redundant used writes", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const resolveStart = source.indexOf("  public resolve(");
    const nextMethodStart = source.indexOf(
      "  public getUnusedVariables",
      resolveStart,
    );

    expect(resolveStart).toBeGreaterThanOrEqual(0);
    expect(nextMethodStart).toBeGreaterThan(resolveStart);

    const resolveSource = source.slice(resolveStart, nextMethodStart);
    const variableKind = resolveSource.indexOf('symbol.kind === "Variable"');
    const usedGuard = resolveSource.indexOf("symbol.used !== true");
    const usedWrite = resolveSource.indexOf("symbol.used = true");

    expect(variableKind).toBeGreaterThanOrEqual(0);
    expect(usedGuard).toBeGreaterThan(variableKind);
    expect(usedWrite).toBeGreaterThan(usedGuard);
  });
});
