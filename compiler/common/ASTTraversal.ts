/**
 * AST Traversal Utilities
 *
 * Shared utilities for traversing and querying AST nodes.
 * Used by both the compiler and VSCode extension.
 */

import type * as AST from "./AST";
import type { SourceLocation } from "./CompilerError";

/**
 * Options for AST traversal
 */
export interface TraversalOptions {
  /** Skip these property names during traversal */
  skipProperties?: string[];
  /** Maximum depth to traverse (default: Infinity) */
  maxDepth?: number;
  /** Whether to traverse into arrays (default: true) */
  traverseArrays?: boolean;
}

/** Default properties to skip during traversal */
const DEFAULT_SKIP_PROPERTIES = [
  "location",
  "resolvedType",
  "resolvedDeclaration",
  "documentation",
  "aliasDeclaration",
  "variableDeclaration",
  "declaration",
  "bindingDeclaration",
];

/**
 * Callback for node visitors
 * @param node The current node
 * @param path Array of ancestor nodes from root to current
 * @param depth Current traversal depth
 * @returns false to stop traversal, true/void to continue
 */
export type NodeVisitor = (
  node: AST.ASTNode,
  path: AST.ASTNode[],
  depth: number,
) => boolean | void;

/**
 * Walk the AST tree depth-first, calling visitor for each node
 *
 * @example
 * ```typescript
 * walkAST(ast, (node, path, depth) => {
 *   if (node.kind === "FunctionDecl") {
 *     console.log("Found function:", (node as AST.FunctionDecl).name);
 *   }
 * });
 * ```
 */
export function walkAST(
  node: AST.ASTNode | null | undefined,
  visitor: NodeVisitor,
  options: TraversalOptions = {},
): void {
  if (!node) return;

  const skipProps = new Set(options.skipProperties ?? DEFAULT_SKIP_PROPERTIES);
  const maxDepth = options.maxDepth ?? Infinity;
  const traverseArrays = options.traverseArrays ?? true;

  function walk(
    current: AST.ASTNode,
    path: AST.ASTNode[],
    depth: number,
  ): boolean {
    if (depth > maxDepth) return true;

    // Visit current node
    const result = visitor(current, path, depth);
    if (result === false) return false;

    // Traverse children
    const newPath = [...path, current];
    for (const key of Object.keys(current)) {
      if (skipProps.has(key)) continue;

      const child = (current as any)[key];
      if (child === null || child === undefined) continue;

      if (traverseArrays && Array.isArray(child)) {
        for (const item of child) {
          if (isASTNode(item)) {
            if (!walk(item, newPath, depth + 1)) return false;
          }
        }
      } else if (isASTNode(child)) {
        if (!walk(child, newPath, depth + 1)) return false;
      }
    }

    return true;
  }

  walk(node, [], 0);
}

/**
 * Find all nodes matching a predicate
 *
 * @example
 * ```typescript
 * const functions = findNodes(ast, node => node.kind === "FunctionDecl");
 * ```
 */
export function findNodes(
  node: AST.ASTNode | null | undefined,
  predicate: (node: AST.ASTNode) => boolean,
  options: TraversalOptions = {},
): AST.ASTNode[] {
  const results: AST.ASTNode[] = [];
  walkAST(
    node,
    (n) => {
      if (predicate(n)) results.push(n);
    },
    options,
  );
  return results;
}

/**
 * Find the first node matching a predicate
 */
export function findNode(
  node: AST.ASTNode | null | undefined,
  predicate: (node: AST.ASTNode) => boolean,
  options: TraversalOptions = {},
): AST.ASTNode | null {
  let found: AST.ASTNode | null = null;
  walkAST(
    node,
    (n) => {
      if (predicate(n)) {
        found = n;
        return false; // Stop traversal
      }
    },
    options,
  );
  return found;
}

/**
 * Check if a position is within a source location
 */
export function isPositionInLocation(
  line: number,
  column: number,
  loc: SourceLocation,
): boolean {
  // Check if before start
  if (line < loc.startLine) return false;
  if (line === loc.startLine && column < loc.startColumn) return false;

  // Check if after end
  if (line > loc.endLine) return false;
  if (line === loc.endLine && column > loc.endColumn) return false;

  return true;
}

/** Multiplier for location size calculation (prioritizes line over column) */
const LOCATION_SIZE_LINE_MULTIPLIER = 10000;

/**
 * Calculate the "size" of a location for specificity comparison
 * Smaller size = more specific
 */
export function locationSize(loc: SourceLocation): number {
  return (
    (loc.endLine - loc.startLine) * LOCATION_SIZE_LINE_MULTIPLIER +
    (loc.endColumn - loc.startColumn)
  );
}

/**
 * Find the AST node at a specific position
 * Returns the path from root to the most specific node
 *
 * @param node Root AST node to search
 * @param line 1-indexed line number
 * @param column 1-indexed column number
 * @returns Array of nodes from root to most specific, or empty array if not found
 *
 * @example
 * ```typescript
 * const path = findNodeAtPosition(ast, 10, 5);
 * const mostSpecific = path[path.length - 1];
 * ```
 */
export function findNodeAtPosition(
  node: AST.ASTNode | null | undefined,
  line: number,
  column: number,
): AST.ASTNode[] {
  if (!node || !node.location) return [];

  // Check bounds
  if (!isPositionInLocation(line, column, node.location)) return [];

  // Try to find a child that contains the position
  for (const key of Object.keys(node)) {
    if (DEFAULT_SKIP_PROPERTIES.includes(key)) continue;

    const child = (node as any)[key];
    if (child === null || child === undefined) continue;

    if (Array.isArray(child)) {
      for (const item of child) {
        if (isASTNode(item)) {
          const childPath = findNodeAtPosition(item, line, column);
          if (childPath.length > 0) {
            return [node, ...childPath];
          }
        }
      }
    } else if (isASTNode(child)) {
      const childPath = findNodeAtPosition(child, line, column);
      if (childPath.length > 0) {
        return [node, ...childPath];
      }
    }
  }

  // If no child contains the position, then 'node' is the most specific one
  return [node];
}

/**
 * Find the most specific node at a position (returns single node, not path)
 *
 * @param node Root AST node to search
 * @param line 1-indexed line number
 * @param column 1-indexed column number
 * @returns The most specific node at the position, or null if not found
 */
export function findMostSpecificNodeAtPosition(
  node: AST.ASTNode | null | undefined,
  line: number,
  column: number,
): AST.ASTNode | null {
  const path = findNodeAtPosition(node, line, column);
  return path.length > 0 ? path[path.length - 1]! : null;
}

/**
 * Find the most specific node at a position using size-based comparison
 * This is useful when nodes may overlap and you want the smallest containing node
 *
 * @param node Root AST node to search
 * @param line 1-indexed line number
 * @param column 1-indexed column number
 * @returns The smallest node containing the position, or null if not found
 */
export function findSmallestNodeAtPosition(
  node: AST.ASTNode | null | undefined,
  line: number,
  column: number,
): AST.ASTNode | null {
  let best: AST.ASTNode | null = null;
  let bestSize = Infinity;

  walkAST(node, (n) => {
    if (!n.location) return;

    if (isPositionInLocation(line, column, n.location)) {
      const size = locationSize(n.location);
      if (size < bestSize) {
        best = n;
        bestSize = size;
      }
    }
  });

  return best;
}

/**
 * Find the enclosing node of a specific kind at a position
 *
 * @example
 * ```typescript
 * const func = findEnclosingNodeOfKind(ast, 10, 5, "FunctionDecl");
 * if (func) console.log("Inside function:", (func as AST.FunctionDecl).name);
 * ```
 */
export function findEnclosingNodeOfKind(
  node: AST.ASTNode | null | undefined,
  line: number,
  column: number,
  kind: string,
): AST.ASTNode | null {
  const path = findNodeAtPosition(node, line, column);
  for (let i = path.length - 1; i >= 0; i--) {
    const n = path[i];
    if (n && n.kind === kind) return n;
  }
  return null;
}

/**
 * Get all ancestor nodes of a specific kind
 *
 * @example
 * ```typescript
 * const ancestors = getAncestorsOfKind(path, "StructDecl");
 * ```
 */
export function getAncestorsOfKind(
  path: AST.ASTNode[],
  kind: string,
): AST.ASTNode[] {
  return path.filter((n) => n.kind === kind);
}

/**
 * Check if a value is an AST node
 */
export function isASTNode(value: unknown): value is AST.ASTNode {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    typeof (value as any).kind === "string"
  );
}

/**
 * Get all direct children of an AST node
 */
export function getChildren(
  node: AST.ASTNode,
  options: TraversalOptions = {},
): AST.ASTNode[] {
  const skipProps = new Set(options.skipProperties ?? DEFAULT_SKIP_PROPERTIES);
  const children: AST.ASTNode[] = [];

  for (const key of Object.keys(node)) {
    if (skipProps.has(key)) continue;

    const child = (node as any)[key];
    if (child === null || child === undefined) continue;

    if (Array.isArray(child)) {
      for (const item of child) {
        if (isASTNode(item)) {
          children.push(item);
        }
      }
    } else if (isASTNode(child)) {
      children.push(child);
    }
  }

  return children;
}

/**
 * Count all nodes in an AST
 */
export function countNodes(
  node: AST.ASTNode | null | undefined,
  options: TraversalOptions = {},
): number {
  let count = 0;
  walkAST(
    node,
    () => {
      count++;
    },
    options,
  );
  return count;
}

/**
 * Get the parent of a node given a path
 */
export function getParent(path: AST.ASTNode[]): AST.ASTNode | null {
  return path.length >= 2 ? path[path.length - 2]! : null;
}

/**
 * Collect all identifiers in an AST
 */
export function collectIdentifiers(
  node: AST.ASTNode | null | undefined,
): AST.IdentifierExpr[] {
  return findNodes(
    node,
    (n) => n.kind === "IdentifierExpr",
  ) as AST.IdentifierExpr[];
}

/**
 * Collect all function declarations in an AST
 */
export function collectFunctionDecls(
  node: AST.ASTNode | null | undefined,
): AST.FunctionDecl[] {
  return findNodes(
    node,
    (n) => n.kind === "FunctionDecl",
  ) as AST.FunctionDecl[];
}

/**
 * Collect all struct declarations in an AST
 */
export function collectStructDecls(
  node: AST.ASTNode | null | undefined,
): AST.StructDecl[] {
  return findNodes(node, (n) => n.kind === "StructDecl") as AST.StructDecl[];
}
