import * as AST from "../common/AST";

export type SymbolKind =
  | "Variable"
  | "Function"
  | "Struct"
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
}

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();
  private parent?: SymbolTable;

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
  }

  public getInCurrentScope(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }

  public resolve(name: string): Symbol | undefined {
    const symbol = this.symbols.get(name);
    if (symbol) return symbol;
    if (this.parent) return this.parent.resolve(name);
    return undefined;
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
        if (b.charAt(i - 1) == a.charAt(j - 1)) {
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
}
