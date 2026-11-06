import {
  DocumentLink,
  type DocumentLinkParams,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { lexWithGrammar } from "../../../compiler/frontend/GrammarLexer";
import { TokenType } from "../../../compiler/frontend/TokenType";
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
    const ast = this.astResolver.parseDocumentContent(filePath, content);
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

    const statementRange = this.nodeToRange(importStmt);
    if (!statementRange) return null;
    const statementText = document.getText(statementRange);
    const tokens = lexWithGrammar(statementText, document.uri);
    const sourceToken = tokens.find(
      (token) =>
        token.type === TokenType.StringLiteral &&
        token.literal === importStmt.source,
    );
    if (!sourceToken) return null;

    // Lexer columns count UTF-16 units; use document offsets to retain raw
    // escape sequences and all supported newline spellings inside the range.
    const statementDocument = TextDocument.create(
      document.uri,
      document.languageId,
      document.version,
      statementText,
    );
    const pathOffset =
      document.offsetAt(statementRange.start) +
      statementDocument.offsetAt({
        line: sourceToken.line - 1,
        character: sourceToken.column - 1,
      }) +
      1;
    return Range.create(
      document.positionAt(pathOffset),
      document.positionAt(pathOffset + sourceToken.lexeme.length - 2),
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
