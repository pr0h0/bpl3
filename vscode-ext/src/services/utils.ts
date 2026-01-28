/**
 * LSP Server Utilities
 * Shared utility functions for the language server
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import type * as AST from "../../../compiler/common/AST";

// Re-export AST traversal utilities from compiler for convenience
export {
  findNodeAtPosition,
  findMostSpecificNodeAtPosition,
  findSmallestNodeAtPosition,
  findEnclosingNodeOfKind,
  walkAST,
  findNodes,
  findNode,
  isASTNode,
  getChildren,
} from "../../../compiler/common/ASTTraversal";

/**
 * Convert a TypeNode to a readable string
 */
export function typeNodeToString(type: AST.TypeNode | undefined): string {
  if (!type) return "void";
  switch (type.kind) {
    case "BasicType":
      let name = type.name;
      if (type.genericArgs && type.genericArgs.length > 0) {
        name += `<${type.genericArgs.map(typeNodeToString).join(", ")}>`;
      }
      if (type.arrayDimensions) {
        for (const dim of type.arrayDimensions) {
          name += `[${dim !== null ? dim : ""}]`;
        }
      }
      if (type.pointerDepth) {
        name = "*".repeat(type.pointerDepth) + name;
      }
      return name;
    case "FunctionType":
      const params = type.paramTypes.map(typeNodeToString).join(", ");
      const ret = typeNodeToString(type.returnType);
      return `Func<${ret}>(${params})`;
    case "TupleType":
      return `(${type.types.map(typeNodeToString).join(", ")})`;
    default:
      return "unknown";
  }
}

/**
 * Get text content for a URI (from open document or disk)
 */
export function getTextForUri(
  uri: string,
  openDocuments: TextDocuments<TextDocument>,
): string | null {
  const doc = openDocuments.get(uri);
  if (doc) return doc.getText();
  try {
    const fsPath = fileURLToPath(uri);
    return fs.readFileSync(fsPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Find the workspace lib directory (for std/* imports)
 */
export function findWorkspaceLibDir(startDir: string): string | null {
  // Check BPL_HOME environment variable first
  if (process.env.BPL_HOME) {
    const bplHomeLib = path.join(process.env.BPL_HOME, "lib");
    if (fs.existsSync(bplHomeLib)) {
      return bplHomeLib;
    }
    if (fs.existsSync(path.join(process.env.BPL_HOME, "string.bpl"))) {
      return process.env.BPL_HOME;
    }
  }

  let dir = startDir;
  const maxUp = 10;
  for (let i = 0; i < maxUp; i++) {
    const libDir = path.join(dir, "lib");
    if (
      fs.existsSync(libDir) &&
      fs.existsSync(path.join(libDir, "string.bpl"))
    ) {
      return libDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve an import path to a file path
 */
export function resolveImportToFile(
  importPath: string | undefined,
  currentDir: string,
): string | null {
  if (!importPath) return null;

  // Handle std/* imports
  if (importPath.startsWith("std/") || importPath.startsWith("std\\")) {
    const libDir = findWorkspaceLibDir(currentDir);
    if (libDir) {
      const libPath = importPath.replace(/^std[/\\]/, "");
      const fullPath = path.join(libDir, libPath);
      const withExt = fullPath.endsWith(".bpl") ? fullPath : fullPath + ".bpl";
      if (fs.existsSync(withExt)) return withExt;
    }
    return null;
  }

  // Handle relative imports
  if (
    importPath.startsWith("./") ||
    importPath.startsWith("../") ||
    importPath.startsWith("/")
  ) {
    const fullPath = path.resolve(currentDir, importPath);
    const withExt = fullPath.endsWith(".bpl") ? fullPath : fullPath + ".bpl";
    if (fs.existsSync(withExt)) return withExt;
    if (fs.existsSync(fullPath)) return fullPath;
  }

  return null;
}

/**
 * Clamp a position to be within document bounds
 */
export function clampPosition(
  doc: TextDocument,
  line: number,
  character: number,
): { line: number; character: number } {
  const lineCount = doc.lineCount;
  const clampedLine = Math.min(Math.max(0, line), lineCount - 1);
  const lineText = doc.getText({
    start: { line: clampedLine, character: 0 },
    end: { line: clampedLine, character: Number.MAX_VALUE },
  });
  const clampedChar = Math.min(Math.max(0, character), lineText.length);
  return { line: clampedLine, character: clampedChar };
}

/**
 * Get the word at a position in a document
 */
export function getWordAtPosition(
  document: TextDocument,
  position: { line: number; character: number },
): string {
  const text = document.getText();
  const lines = text.split("\n");
  const line = lines[position.line] ?? "";

  let start = position.character;
  let end = position.character;

  // Find word boundaries
  while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1] ?? "")) {
    start--;
  }
  while (end < line.length && /[a-zA-Z0-9_]/.test(line[end] ?? "")) {
    end++;
  }

  return line.substring(start, end);
}

/**
 * Convert file path to VS Code URI
 */
export function filePathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

/**
 * Convert VS Code URI to file path
 */
export function uriToFilePath(uri: string): string {
  return fileURLToPath(uri);
}

/**
 * Find the enclosing struct at a given line
 */
export function findEnclosingStruct(text: string, line: number): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";
    const match = /struct\s+([a-zA-Z0-9_]+)/.exec(l);
    if (match) return match[1] || null;
  }
  return null;
}

/**
 * Find the type of a variable at a given line
 */
export function findVariableType(
  text: string,
  varName: string,
  line: number,
): string | null {
  const lines = text.split(/\r?\n/);
  // Search backwards for local declaration or function arg
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";

    // Check for function definition (end of scope search)
    if (l.trim().startsWith("frame ")) {
      const argMatch = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z0-9_]+)`).exec(
        l,
      );
      if (argMatch) return argMatch[1] || null;
      return null;
    }

    // Check for local declaration
    const declMatch = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z0-9_]+)`).exec(
      l,
    );
    if (declMatch) {
      return declMatch[1] || null;
    }
  }

  // Search for global declaration
  const globalMatch = new RegExp(
    `\\bglobal\\s+${varName}\\s*:\\s*([a-zA-Z0-9_]+)`,
  ).exec(text);
  if (globalMatch) return globalMatch[1] || null;

  return null;
}
