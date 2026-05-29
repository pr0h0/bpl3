import {
  DocumentLink,
  type DocumentLinkParams,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { ModuleResolver } from "./ModuleResolver";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * Provides document links - makes import paths clickable
 */
export class DocumentLinkProvider {
  constructor(
    private astResolver: ASTResolver,
    private moduleResolver = new ModuleResolver(),
  ) {}

  /**
   * Provide document links for imports
   */
  provide(params: DocumentLinkParams, document: TextDocument): DocumentLink[] {
    const filePath = fileURLToPath(document.uri);
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
        const link = this.createLinkForImport(importStmt, filePath, document);
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
    document: TextDocument,
  ): DocumentLink | null {
    const importPath = importStmt.source;
    if (!importPath || !importStmt.location) return null;

    // Resolve the import path to an actual file
    const resolved = this.moduleResolver.resolve(importPath, currentFile);
    if (!resolved) return null;

    // Create range for the import path string
    const range = this.getImportPathRange(importStmt, document);
    if (!range) return null;

    return {
      range: range,
      target: pathToFileURL(resolved.filePath).toString(),
      tooltip: `Go to ${resolved.filePath}`,
    };
  }

  /**
   * Get the range of the import path string in the source
   */
  private getImportPathRange(
    importStmt: AST.ImportStmt,
    document: TextDocument,
  ): Range | null {
    if (!importStmt.location) return null;

    const loc = importStmt.location;
    const startLine = (loc.startLine ?? 1) - 1;
    const endLine = (loc.endLine ?? loc.startLine ?? 1) - 1;
    const statementText = document.getText(
      Range.create(startLine, 0, endLine + 1, 0),
    );
    const fromIndex = statementText.indexOf("from");
    const quotedPath = new RegExp(
      `["']${escapeRegExp(importStmt.source)}["']`,
    ).exec(statementText.slice(Math.max(0, fromIndex)));
    if (!quotedPath) return this.nodeToRange(importStmt);

    const quoteStart =
      Math.max(0, fromIndex) + quotedPath.index + 1;
    const beforePath = statementText.slice(0, quoteStart);
    const lineOffset = beforePath.split(/\r?\n/).length - 1;
    const pathLine = startLine + lineOffset;
    const pathColumn = beforePath.split(/\r?\n/).at(-1)?.length ?? 0;

    return Range.create(
      pathLine,
      pathColumn,
      pathLine,
      pathColumn + importStmt.source.length,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
