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

type ResolutionCacheValue = Symbol | typeof UNRESOLVED_SYMBOL;

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();
  private parent?: SymbolTable;
  private resolutionCache?: Map<string, ResolutionCacheValue>;
  private childScopes?: Set<SymbolTable>;

  constructor(parent?: SymbolTable) {
    this.parent = parent;
    if (parent) {
      parent.registerChildScope(this);
    }
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
    this.invalidateResolutionCache();
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
    const cache = this.resolutionCache;
    const cached = cache?.get(name);
    if (cached !== undefined) {
      if (cached === UNRESOLVED_SYMBOL) {
        return undefined;
      }
      if (cached.kind === "Variable" && cached.used !== true) {
        cached.used = true;
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
        (this.resolutionCache ??= new Map()).set(name, symbol);
        return symbol;
      }
      scope = scope.parent;
    }
    (this.resolutionCache ??= new Map()).set(name, UNRESOLVED_SYMBOL);
    return undefined;
  }

  public getUnusedVariables(): Symbol[] {
    const unused: Symbol[] = [];
    for (const symbol of this.symbols.values()) {
      if (symbol.kind === "Variable" && !symbol.used) {
        unused.push(symbol);
      }
    }
    return unused;
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

    for (const candidate of allNames) {
      const distance = this.levenshtein(name, candidate);
      if (distance < minDistance && distance <= 3 && distance < name.length) {
        minDistance = distance;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private levenshtein(a: string, b: string): number {
    if (!a || !b) return (a || b)?.length;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1, // substitution
            Math.min(
              matrix[i]![j - 1]! + 1, // insertion
              matrix[i - 1]![j]! + 1, // deletion
            ),
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  private registerChildScope(child: SymbolTable): void {
    (this.childScopes ??= new Set()).add(child);
  }

  private invalidateResolutionCache(): void {
    this.resolutionCache?.clear();
    if (!this.childScopes) return;
    for (const child of this.childScopes) {
      child.invalidateResolutionCache();
    }
  }
}
