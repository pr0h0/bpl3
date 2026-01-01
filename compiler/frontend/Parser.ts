import * as AST from "../common/AST";
import type { CompilerError } from "../common/CompilerError";
import { parseWithPeggy } from "./PeggyParser";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

export class Parser {
  private readonly source: string;
  private readonly filePath: string;
  private readonly tokens: Token[];

  constructor(source: string, filePath: string, tokens: Token[] = []) {
    this.source = source;
    this.filePath = filePath;
    this.tokens = tokens;
  }

  public parse(
    injectImplicitImports: boolean = false,
    throwOnError: boolean = true,
  ): AST.Program {
    const ast = parseWithPeggy(this.source, this.filePath);

    // Implicitly import Error from std/errors.bpl if not already in errors.bpl
    const isErrorsBpl =
      this.filePath.endsWith("errors.bpl") ||
      this.filePath.endsWith("errors.x") ||
      this.filePath.endsWith("intrinsics.bpl");
    if (injectImplicitImports && !isErrorsBpl) {
      const errorImport: AST.ImportStmt = {
        kind: "Import",
        items: [{ name: "Error", isType: true, isWrapped: false }],
        source: "std/errors.bpl",
        importAll: false,
        isImplicit: true,
        location: {
          file: this.filePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      };
      ast.statements.unshift(errorImport);
    }

    if (this.tokens.length > 0) {
      const comments = this.tokens.filter((t) => t.type === TokenType.Comment);
      this.attachComments(ast);
      const result = { ...ast, comments };

      // Check for syntax errors from error recovery
      if (
        throwOnError &&
        (ast as any).errors &&
        (ast as any).errors.length > 0
      ) {
        const errors = (ast as any).errors as CompilerError[];
        // If we want to report all errors, we might need a way to pass them up.
        // For now, throw the first one to stop compilation.
        throw errors[0];
      }

      return result;
    }

    // Check for syntax errors from error recovery
    if (throwOnError && (ast as any).errors && (ast as any).errors.length > 0) {
      const errors = (ast as any).errors as CompilerError[];
      throw errors[0];
    }

    return ast;
  }

  private attachComments(ast: AST.Program) {
    if (this.tokens.length === 0) return;

    // Only consider multi-line comments starting with /#
    const comments = this.tokens
      .filter((t) => t.type === TokenType.Comment && t.lexeme.startsWith("/#"))
      .map((t) => ({
        token: t,
        // Calculate end line based on newlines in lexeme
        endLine: t.line + t.lexeme.split(/\r\n|\r|\n/).length - 1,
      }));

    if (comments.length === 0) return;

    const processNode = (node: AST.ASTNode) => {
      const startLine = node.location.startLine;
      // Find comment that ends exactly on the line before the node starts
      // We could allow a gap, but strict adjacency is safer for now
      const comment = comments.find((c) => c.endLine === startLine - 1);
      if (comment) {
        let cleanDoc = comment.token.lexeme;
        // Remove /# and #/ markers
        if (cleanDoc.startsWith("/#")) {
          cleanDoc = cleanDoc.substring(2);
          if (cleanDoc.endsWith("#/")) {
            cleanDoc = cleanDoc.substring(0, cleanDoc.length - 2);
          }
        }
        node.documentation = cleanDoc.trim();
      }
    };

    for (const stmt of ast.statements) {
      // Attach to top-level declarations
      if (
        [
          "FunctionDecl",
          "StructDecl",
          "EnumDecl",
          "SpecDecl",
          "TypeDecl",
          "GlobalVarDecl",
        ].includes(stmt.kind)
      ) {
        processNode(stmt);

        if (stmt.kind === "StructDecl") {
          const s = stmt as AST.StructDecl;
          s.members.forEach(processNode);
        } else if (stmt.kind === "EnumDecl") {
          const e = stmt as AST.EnumDecl;
          e.variants.forEach(processNode);
          e.methods.forEach(processNode);
        } else if (stmt.kind === "SpecDecl") {
          const s = stmt as AST.SpecDecl;
          s.methods.forEach(processNode);
        }
      }
    }
  }
}
