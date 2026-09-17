/**
 * Gives colliding module-level declarations distinct names before modules are
 * merged for code generation.
 *
 * Type checking resolves names per module, so a private helper in one module
 * never sees a same-named declaration in another. Code generation, however,
 * emits one program with a flat namespace (`%struct.Name`, `@name_params`).
 * Without this pass, same-named private structs, functions, or globals from
 * different modules silently replace one another.
 *
 * Standard-library declarations keep their names (the compiler refers to some
 * of them, such as `String` and `Error`, by name), then the entry module, then
 * other modules in dependency order. Every other colliding declaration is
 * renamed `Name__N`, and every reference that resolves to it is updated.
 */
import type * as AST from "../common/AST";
import type { SymbolTable } from "./SymbolTable";

export interface UniquerModule {
  path: string;
  ast: AST.Program;
  scope?: SymbolTable;
  isStandardLibrary: boolean;
  isEntry: boolean;
}

type NamedDeclaration =
  | AST.StructDecl
  | AST.EnumDecl
  | AST.SpecDecl
  | AST.TypeAliasDecl
  | AST.FunctionDecl
  | AST.VariableDecl;

const TYPE_DECLARATION_KINDS = new Set([
  "StructDecl",
  "EnumDecl",
  "SpecDecl",
  "TypeAlias",
]);

// Links to other declarations or scopes; the owning module walks those.
const SKIPPED_KEYS = new Set([
  "resolvedDeclaration",
  "declaration",
  "moduleScope",
  "location",
  "parent",
]);

export interface UniquerResult {
  /** Declarations renamed by this pass, with their source names. */
  renamed: Map<AST.ASTNode, { from: string; to: string }>;
}

export function uniqueModuleSymbols(modules: UniquerModule[]): UniquerResult {
  const renamed = new Map<AST.ASTNode, { from: string; to: string }>();
  const byName = new Map<
    string,
    { module: UniquerModule; order: number; decl: NamedDeclaration }[]
  >();
  const allNames = new Set<string>();

  modules.forEach((module, order) => {
    for (const stmt of module.ast.statements) {
      const name = declarationName(stmt, module);
      if (!name) continue;
      allNames.add(name);
      const entries = byName.get(name) ?? [];
      entries.push({ module, order, decl: stmt as NamedDeclaration });
      byName.set(name, entries);
    }
  });

  for (const [name, entries] of byName) {
    const owners = new Set(entries.map((entry) => entry.module));
    if (owners.size < 2) continue;
    const keeper = [...owners].sort(
      (a, b) => priority(a, modules) - priority(b, modules),
    )[0]!;
    for (const entry of entries) {
      if (entry.module === keeper) continue;
      let candidate = `${name}__${entry.order}`;
      let bump = 0;
      while (allNames.has(candidate))
        candidate = `${name}__${entry.order}_${++bump}`;
      allNames.add(candidate);
      renamed.set(entry.decl, { from: name, to: candidate });
    }
  }

  if (renamed.size === 0) return { renamed };

  for (const [decl, { from, to }] of renamed) {
    if (decl.kind === "StructDecl" || decl.kind === "EnumDecl") {
      (decl as AST.StructDecl | AST.EnumDecl).sourceName = from;
    }
    (decl as NamedDeclaration & { name: string }).name = to;
  }

  const visited = new Set<object>();
  for (const module of modules) {
    const typeNames = moduleTypeRenames(module, renamed);
    walk(module.ast, typeNames, renamed, visited);
  }

  return { renamed };
}

function declarationName(
  stmt: AST.Statement,
  module: UniquerModule,
): string | undefined {
  switch (stmt.kind) {
    case "StructDecl":
    case "EnumDecl":
    case "SpecDecl":
    case "TypeAlias":
      return (stmt as { name: string }).name;
    case "FunctionDecl": {
      const name = (stmt as AST.FunctionDecl).name;
      if (module.isEntry && name === "main") return undefined;
      // Runtime helpers are referenced by symbol name from generated code.
      if (name.startsWith("__bpl_")) return undefined;
      return name;
    }
    case "VariableDecl": {
      const name = (stmt as AST.VariableDecl).name;
      return typeof name === "string" ? name : undefined;
    }
    default:
      return undefined;
  }
}

function priority(module: UniquerModule, modules: UniquerModule[]): number {
  const order = modules.indexOf(module);
  if (module.isStandardLibrary) return order;
  if (module.isEntry) return modules.length;
  return modules.length + 1 + order;
}

/** Names visible in a module (own or imported) that now refer to a new name. */
function moduleTypeRenames(
  module: UniquerModule,
  renamed: Map<AST.ASTNode, { from: string; to: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const stmt of module.ast.statements) {
    const rename = renamed.get(stmt);
    if (rename && TYPE_DECLARATION_KINDS.has(stmt.kind)) {
      names.set(rename.from, rename.to);
    }
  }
  if (module.scope) {
    for (const symbol of module.scope.ownSymbols()) {
      const rename = renamed.get(symbol.declaration);
      if (rename && TYPE_DECLARATION_KINDS.has(symbol.declaration.kind)) {
        names.set(symbol.name, rename.to);
      }
      // `import * as ns` makes types reachable as `ns.Type`.
      if (symbol.kind !== "Module" || !symbol.moduleScope) continue;
      for (const exported of symbol.moduleScope.ownSymbols()) {
        const exportedRename = renamed.get(exported.declaration);
        if (
          exportedRename &&
          TYPE_DECLARATION_KINDS.has(exported.declaration.kind)
        ) {
          names.set(
            `${symbol.name}.${exported.name}`,
            `${symbol.name}.${exportedRename.to}`,
          );
        }
      }
    }
  }
  return names;
}

function renameTypeName(name: string, typeNames: Map<string, string>): string {
  const direct = typeNames.get(name);
  if (direct) return direct;
  // Qualified names such as `Color.Red` keep their member part.
  const dot = name.indexOf(".");
  if (dot > 0) {
    const head = typeNames.get(name.slice(0, dot));
    if (head) return head + name.slice(dot);
  }
  return name;
}

function walk(
  node: unknown,
  typeNames: Map<string, string>,
  renamed: Map<AST.ASTNode, { from: string; to: string }>,
  visited: Set<object>,
): void {
  if (node === null || typeof node !== "object") return;
  if (visited.has(node)) return;
  visited.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walk(item, typeNames, renamed, visited);
    return;
  }

  const record = node as Record<string, unknown> & {
    kind?: string;
    name?: unknown;
    resolvedDeclaration?: AST.ASTNode & { kind: string };
  };

  switch (record.kind) {
    case "BasicType": {
      const declaration = record.resolvedDeclaration;
      const rename = declaration ? renamed.get(declaration) : undefined;
      if (rename) {
        record.name = rename.to;
      } else if (!declaration && typeof record.name === "string") {
        // Nodes without a recorded declaration use the module's visible names.
        record.name = renameTypeName(record.name, typeNames);
      }
      break;
    }
    case "Identifier": {
      const declaration = record.resolvedDeclaration;
      const rename = declaration ? renamed.get(declaration) : undefined;
      if (rename) record.name = rename.to;
      break;
    }
    default:
      break;
  }

  for (const key of ["structName", "enumName", "captureStructName"]) {
    const value = record[key];
    if (typeof value === "string") {
      record[key] = renameTypeName(value, typeNames);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (value !== null && typeof value === "object") {
      walk(value, typeNames, renamed, visited);
    }
  }
}
