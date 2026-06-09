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
  it("keeps resolution cache invalidation lazy and scoped to missed names", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const constructorStart = source.indexOf("  constructor(");
    const constructorEnd = source.indexOf("  public define", constructorStart);
    const resolveStart = source.indexOf("  public resolve(");
    const nextMethodStart = source.indexOf(
      "  public getUnusedVariables",
      resolveStart,
    );

    expect(constructorStart).toBeGreaterThanOrEqual(0);
    expect(constructorEnd).toBeGreaterThan(constructorStart);
    expect(resolveStart).toBeGreaterThanOrEqual(0);
    expect(nextMethodStart).toBeGreaterThan(resolveStart);

    const constructorSource = source.slice(constructorStart, constructorEnd);
    const resolveSource = source.slice(resolveStart, nextMethodStart);
    expect(source).toContain("const UNRESOLVED_SYMBOL");
    expect(source).toContain("private resolutionCache");
    expect(source).toContain("private missDependentsByName");
    expect(source).toContain("registerMissWithAncestors(name)");
    expect(source).toContain("private invalidateResolutionCacheFor");
    expect(source).toContain("this.invalidateResolutionCacheFor(symbol.name)");
    expect(source).not.toContain("private childScopes");
    expect(source).not.toContain("private registerChildScope");
    expect(source).not.toContain("child.invalidateResolutionCache()");
    expect(constructorSource).not.toContain("registerChildScope");
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

  it("defines known-new symbols while invalidating cached child misses", () => {
    const root = new SymbolTable();
    const child = root.enterScope();

    expect(child.resolve("known_new")).toBeUndefined();

    const symbol: Symbol = {
      name: "known_new",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    root.defineNew(symbol);

    expect(root.getInCurrentScope("known_new")).toBe(symbol);
    expect(child.resolve("known_new")).toBe(symbol);
  });

  it("routes new typechecker symbols through the known-new path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "TypeCheckerBase.ts"),
      "utf8",
    );

    expect(source).toContain("this.currentScope.defineNew(symbol)");
  });

  it("skips define invalidation work before caches or miss dependents exist", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const invalidateStart = source.indexOf(
      "  private invalidateResolutionCacheFor",
    );
    const invalidateEnd = source.indexOf("\n  }\n}", invalidateStart);

    expect(invalidateStart).toBeGreaterThanOrEqual(0);
    expect(invalidateEnd).toBeGreaterThan(invalidateStart);

    const invalidateSource = source.slice(invalidateStart, invalidateEnd);
    expect(invalidateSource).toContain(
      "if (!this.resolutionCache && !this.missDependentsByName) return;",
    );
    expect(invalidateSource.indexOf("return;")).toBeLessThan(
      invalidateSource.indexOf("this.resolutionCache?.delete(name)"),
    );
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

  it("reuses the local resolution cache when populating resolve results", () => {
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
    expect(resolveSource).toContain("let cache = this.resolutionCache;");
    expect(resolveSource).toContain("cache = new Map();");
    expect(resolveSource).toContain("this.resolutionCache = cache;");
    expect(resolveSource).toContain("cache.set(name, symbol);");
    expect(resolveSource).toContain("cache.set(name, UNRESOLVED_SYMBOL);");
    expect(resolveSource).not.toContain(
      "(this.resolutionCache ??= new Map()).set",
    );
  });

  it("does not allocate a resolution cache for a first local hit", () => {
    const scope = new SymbolTable();
    const symbol: Symbol = {
      name: "local_value",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    scope.define(symbol);

    expect(scope.resolve("local_value")).toBe(symbol);
    expect(
      (
        scope as unknown as {
          resolutionCache?: Map<string, unknown>;
        }
      ).resolutionCache,
    ).toBeUndefined();
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

  it("reuses empty unused-variable results without sharing populated results", () => {
    const scope = new SymbolTable();
    const empty = scope.getUnusedVariables();
    expect(scope.getUnusedVariables()).toBe(empty);

    const variable: Symbol = {
      name: "value",
      kind: "Variable",
      declaration: {
        kind: "VariableDecl",
        location: dummyLocation,
      },
      used: false,
    };
    scope.define(variable);

    const unused = scope.getUnusedVariables();
    expect(unused).not.toBe(empty);
    expect(unused).toEqual([variable]);
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

  it("returns cached symbols without repeating used-state checks", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "SymbolTable.ts"),
      "utf8",
    );
    const resolveStart = source.indexOf("  public resolve(");
    const scopeWalkStart = source.indexOf(
      "    let scope: SymbolTable | undefined = this;",
      resolveStart,
    );
    const nextMethodStart = source.indexOf(
      "  public getUnusedVariables",
      scopeWalkStart,
    );

    expect(resolveStart).toBeGreaterThanOrEqual(0);
    expect(scopeWalkStart).toBeGreaterThan(resolveStart);
    expect(nextMethodStart).toBeGreaterThan(scopeWalkStart);

    const cacheHitSource = source.slice(resolveStart, scopeWalkStart);
    const scopeWalkSource = source.slice(scopeWalkStart, nextMethodStart);
    const usedWrite = scopeWalkSource.indexOf("symbol.used = true");
    const cacheWrite = scopeWalkSource.indexOf("cache.set(name, symbol)");

    expect(cacheHitSource).not.toContain("cached.kind");
    expect(cacheHitSource).not.toContain("cached.used");
    expect(usedWrite).toBeGreaterThanOrEqual(0);
    expect(cacheWrite).toBeGreaterThan(usedWrite);
  });
});
