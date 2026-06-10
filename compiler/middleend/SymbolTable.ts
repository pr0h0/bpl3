import * as AST from "../common/AST";

export type SymbolKind =
  | "Variable"
  | "Function"
  | "Struct"
  | "Enum"
  | "Spec"
  | "TypeAlias"
  | "Parameter"
  | "Module";

export interface Symbol {
  name: string;
  kind: SymbolKind;
  type?: AST.TypeNode;
  declaration: AST.ASTNode;
  moduleScope?: SymbolTable;
  overloads?: Symbol[];
  used?: boolean;
  isConst?: boolean;
}

const UNRESOLVED_SYMBOL = Symbol("unresolved-symbol");
const EMPTY_UNUSED_VARIABLES: readonly Symbol[] = [];

type ResolutionCacheValue = Symbol | typeof UNRESOLVED_SYMBOL;

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();
  private parent?: SymbolTable;
  private resolutionCache?: Map<string, ResolutionCacheValue>;
  private missDependentsByName?: Map<string, Set<SymbolTable>>;

  constructor(parent?: SymbolTable) {
    this.parent = parent;
  }

  public define(symbol: Symbol): void {
    const existing = this.symbols.get(symbol.name);
    if (
      existing &&
      existing.kind === "Function" &&
      symbol.kind === "Function"
    ) {
      if (!existing.overloads) {
        existing.overloads = [];
      }
      existing.overloads.push(symbol);
    } else {
      this.symbols.set(symbol.name, symbol);
    }
    this.invalidateResolutionCacheFor(symbol.name);
  }

  public defineNew(symbol: Symbol): void {
    this.symbols.set(symbol.name, symbol);
    this.invalidateResolutionCacheFor(symbol.name);
  }

  public getInCurrentScope(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }

  public findInOuterScopes(name: string): Symbol | undefined {
    let scope = this.parent;
    while (scope) {
      const symbol = scope.getInCurrentScope(name);
      if (symbol) return symbol;
      scope = scope.getParent();
    }
    return undefined;
  }

  public resolve(name: string): Symbol | undefined {
    let cache = this.resolutionCache;
    const cached = cache?.get(name);
    if (cached !== undefined) {
      if (cached === UNRESOLVED_SYMBOL) {
        return undefined;
      }
      return cached;
    }

    let scope: SymbolTable | undefined = this;
    while (scope) {
      const symbol = scope.symbols.get(name);
      if (symbol) {
        if (symbol.kind === "Variable" && symbol.used !== true) {
          symbol.used = true;
        }
        if (scope === this && !cache) {
          return symbol;
        }
        if (!cache) {
          cache = new Map();
          this.resolutionCache = cache;
        }
        cache.set(name, symbol);
        return symbol;
      }
      scope = scope.parent;
    }
    if (!cache) {
      cache = new Map();
      this.resolutionCache = cache;
    }
    cache.set(name, UNRESOLVED_SYMBOL);
    this.registerMissWithAncestors(name);
    return undefined;
  }

  public getUnusedVariables(): readonly Symbol[] {
    if (this.symbols.size === 0) return EMPTY_UNUSED_VARIABLES;

    let unused: Symbol[] | undefined;
    for (const symbol of this.symbols.values()) {
      if (symbol.kind === "Variable" && !symbol.used) {
        (unused ??= []).push(symbol);
      }
    }
    return unused ?? EMPTY_UNUSED_VARIABLES;
  }

  public enterScope(): SymbolTable {
    return new SymbolTable(this);
  }

  public exitScope(): SymbolTable {
    return this.parent || this;
  }

  public getParent(): SymbolTable | undefined {
    return this.parent;
  }

  public getAllSymbols(): string[] {
    const names = Array.from(this.symbols.keys());
    if (this.parent) {
      return names.concat(this.parent.getAllSymbols());
    }
    return names;
  }

  public findSimilar(name: string): string | undefined {
    const allNames = this.getAllSymbols();
    let bestMatch: string | undefined;
    let minDistance = Infinity;
    const maxDistance = Math.min(3, name.length - 1);
    if (maxDistance < 0) return undefined;

    const previousRow = new Array<number>(name.length + 1);
    const currentRow = new Array<number>(name.length + 1);

    for (const candidate of allNames) {
      if (Math.abs(name.length - candidate.length) > maxDistance) continue;
      const distance = this.levenshtein(
        name,
        candidate,
        maxDistance,
        previousRow,
        currentRow,
      );
      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private levenshtein(
    a: string,
    b: string,
    maxDistance: number,
    previousRow: number[],
    currentRow: number[],
  ): number {
    const sentinel = maxDistance + 1;
    for (let column = 0; column <= a.length; column++) {
      previousRow[column] = column;
    }

    let previous = previousRow;
    let current = currentRow;
    for (let row = 1; row <= b.length; row++) {
      current[0] = row;
      const startColumn = Math.max(1, row - maxDistance);
      const endColumn = Math.min(a.length, row + maxDistance);
      if (startColumn > 1) current[startColumn - 1] = sentinel;

      let rowMinimum = sentinel;
      for (let column = startColumn; column <= endColumn; column++) {
        const value =
          b.charCodeAt(row - 1) === a.charCodeAt(column - 1)
            ? previous[column - 1]!
            : Math.min(
                previous[column - 1]! + 1,
                current[column - 1]! + 1,
                previous[column]! + 1,
              );
        current[column] = value;
        if (value < rowMinimum) rowMinimum = value;
      }
      if (endColumn < a.length) current[endColumn + 1] = sentinel;
      if (rowMinimum > maxDistance) return sentinel;

      const next = previous;
      previous = current;
      current = next;
    }

    return previous[a.length]!;
  }

  private registerMissWithAncestors(name: string): void {
    let scope = this.parent;
    while (scope) {
      scope.registerMissDependent(name, this);
      scope = scope.parent;
    }
  }

  private registerMissDependent(name: string, dependent: SymbolTable): void {
    const dependentsByName =
      this.missDependentsByName ??= new Map<string, Set<SymbolTable>>();
    const dependents = dependentsByName.get(name);
    if (dependents) {
      dependents.add(dependent);
      return;
    }
    dependentsByName.set(name, new Set([dependent]));
  }

  private invalidateResolutionCacheFor(name: string): void {
    if (!this.resolutionCache && !this.missDependentsByName) return;
    this.resolutionCache?.delete(name);
    const dependents = this.missDependentsByName?.get(name);
    if (!dependents) return;
    this.missDependentsByName?.delete(name);
    for (const dependent of dependents) {
      dependent.resolutionCache?.delete(name);
    }
  }
}
