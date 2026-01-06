import {
  DocumentLink,
  type DocumentLinkParams,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import * as path from "path";
import * as fs from "fs";

/**
 * Provides document links - makes import paths clickable
 */
export class DocumentLinkProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Provide document links for imports
   */
  provide(params: DocumentLinkParams, document: TextDocument): DocumentLink[] {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return [];

    const links: DocumentLink[] = [];

    // Find all import statements
    for (const stmt of ast.statements) {
      if (stmt.kind === "Import") {
        const importStmt = stmt as AST.ImportStmt;
        const link = this.createLinkForImport(importStmt, filePath);
        if (link) {
          links.push(link);
        }
      }
    }

    return links;
  }

  /**
   * Create a document link for an import statement
   */
  private createLinkForImport(
    importStmt: AST.ImportStmt,
    currentFile: string,
  ): DocumentLink | null {
    const importPath = importStmt.source;
    if (!importPath || !importStmt.location) return null;

    // Resolve the import path to an actual file
    const resolvedPath = this.resolveImportPath(importPath, currentFile);
    if (!resolvedPath) return null;

    // Create range for the import path string
    const range = this.getImportPathRange(importStmt);
    if (!range) return null;

    return {
      range: range,
      target: `file://${resolvedPath}`,
      tooltip: `Go to ${resolvedPath}`,
    };
  }

  /**
   * Resolve import path to actual file path
   */
  private resolveImportPath(
    importPath: string,
    currentFile: string,
  ): string | null {
    try {
      // Check if it's a relative import
      if (importPath.startsWith("./") || importPath.startsWith("../")) {
        const currentDir = path.dirname(currentFile);
        let resolved = path.resolve(currentDir, importPath);

        // Add .bpl extension if not present
        if (!resolved.endsWith(".bpl")) {
          resolved += ".bpl";
        }

        // Check if file exists
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }

      // Check if it's a stdlib import
      if (importPath.startsWith("std/")) {
        // Try to find lib directory
        const libDir = this.findLibDir(currentFile);
        if (libDir) {
          const relativePath = importPath.substring(4); // Remove "std/"
          let resolved = path.join(libDir, relativePath);

          if (!resolved.endsWith(".bpl")) {
            resolved += ".bpl";
          }

          if (fs.existsSync(resolved)) {
            return resolved;
          }
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Find the lib directory by searching upwards from current file
   */
  private findLibDir(startFile: string): string | null {
    let dir = path.dirname(startFile);
    for (let i = 0; i < 10; i++) {
      const libDir = path.join(dir, "lib");
      if (fs.existsSync(libDir)) {
        return libDir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // Check BPL_HOME environment variable
    if (process.env.BPL_HOME) {
      const bplHomeLib = path.join(process.env.BPL_HOME, "lib");
      if (fs.existsSync(bplHomeLib)) {
        return bplHomeLib;
      }
    }

    return null;
  }

  /**
   * Get the range of the import path string in the source
   */
  private getImportPathRange(importStmt: AST.ImportStmt): Range | null {
    if (!importStmt.location) return null;

    const loc = importStmt.location;

    // The import path is typically after "from" keyword
    // For: import X from "path"
    // We want to highlight just the "path" part

    // Find the string literal position in the import statement
    // This is a simplified approach - we estimate based on the statement location
    const startLine = loc.startLine ?? 1;
    const startCol = (loc.startColumn ?? 1) + 12; // Rough estimate after "import X from "

    // Create a range for the import path (simplified)
    return Range.create(
      startLine - 1,
      startCol,
      startLine - 1,
      startCol + importStmt.source.length,
    );
  }

  /**
   * Convert AST node to LSP Range
   */
  private nodeToRange(node: AST.ASTNode): Range | null {
    if (!node.location) return null;

    const loc = node.location;
    return Range.create(
      (loc.startLine ?? 1) - 1,
      (loc.startColumn ?? 1) - 1,
      (loc.endLine ?? loc.startLine ?? 1) - 1,
      (loc.endColumn ?? loc.startColumn ?? 1) - 1,
    );
  }
}
