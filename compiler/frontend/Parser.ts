import * as AST from "../common/AST";
import { parseWithPeggy } from "./PeggyParser";
import { Token } from "./Token";
import { TokenType } from "./TokenType";
import { rememberParsedSource } from "./ParsedSource";

/** Error types every module can name without importing them. */
const PRELUDE_ERROR_TYPES = [
  "Error",
  "NullAccessError",
  "IndexOutOfBoundsError",
  "DivisionByZeroError",
  "StackOverflowError",
];

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
    const hasCommentMarker = this.source.includes("#");
    const ast = parseWithPeggy(this.source, this.filePath, {
      hasCommentMarker,
    });

    // Implicit prelude: the Error hierarchy used by try/catch and by the
    // runtime checks the compiler inserts (see lib/errors.bpl). Names the
    // file declares itself are not imported.
    const isPreludeProvider =
      this.filePath.endsWith("errors.bpl") ||
      this.filePath.endsWith("errors.x") ||
      this.filePath.endsWith("intrinsics.bpl");
    if (injectImplicitImports && !isPreludeProvider) {
      const declared = new Set(
        ast.statements
          .map((stmt) => (stmt as { name?: unknown }).name)
          .filter((name): name is string => typeof name === "string"),
      );
      const items = PRELUDE_ERROR_TYPES.filter((name) => !declared.has(name));
      if (items.length > 0) {
        const errorImport: AST.ImportStmt = {
          kind: "Import",
          items: items.map((name) => ({
            name,
            isType: true,
            isWrapped: false,
          })),
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
    }

    const tokenComments =
      this.tokens.length > 0 && hasCommentMarker
        ? this.tokens.filter((t) => t.type === TokenType.Comment)
        : [];
    let comments: AST.Token[] = [];
    if (tokenComments.length > 0) {
      // Interpolated strings are opaque to the lexer comment scan, but their
      // expressions can contain comments collected by the grammar.
      const grammarComments = ast.comments || [];
      const grammarPositions = new Set(
        grammarComments.map((comment) => `${comment.line}:${comment.column}`),
      );
      comments = [
        ...grammarComments,
        ...tokenComments.filter(
          (comment) =>
            !grammarPositions.has(`${comment.line}:${comment.column}`),
        ),
      ].sort((a, b) => a.line - b.line || a.column - b.column);
    } else if (hasCommentMarker) {
      comments = ast.comments || [];
    }
    if (hasCommentMarker) {
      this.attachComments(ast, comments);
    }

    if (this.tokens.length > 0) {
      const result = { ...ast, comments };

      // Check for syntax errors from error recovery
      if (throwOnError && ast.errors && ast.errors.length > 0) {
        const errors = ast.errors;
        // If we want to report all errors, we might need a way to pass them up.
        // For now, throw the first one to stop compilation.
        throw errors[0];
      }

      rememberParsedSource(result, this.source);
      return result;
    }

    // Check for syntax errors from error recovery
    if (throwOnError && ast.errors && ast.errors.length > 0) {
      const errors = ast.errors;
      throw errors[0];
    }

    rememberParsedSource(ast, this.source);
    return ast;
  }

  private attachComments(ast: AST.Program, sourceComments: AST.Token[]) {
    // Doc comments are `/# ... #/` blocks or runs of `#` line comments, each
    // on its own line, directly above a declaration (no blank line between).
    // A trailing `x: int, # note` comment documents nothing.
    const lines = this.source.split(/\r\n|\r|\n/);
    const ownLine = (token: AST.Token) =>
      (lines[token.line - 1] ?? "").slice(0, token.column - 1).trim() === "";
    const comments: { lexeme: string; endLine: number }[] = [];
    for (const token of sourceComments) {
      if (token.type !== TokenType.Comment || !ownLine(token)) continue;
      if (token.lexeme.startsWith("/#")) {
        comments.push({
          lexeme: token.lexeme,
          endLine: token.line + token.lexeme.split(/\r\n|\r|\n/).length - 1,
        });
        continue;
      }
      if (!token.lexeme.startsWith("#")) continue;
      const text = token.lexeme.replace(/^#\s?/, "");
      const previous = comments[comments.length - 1];
      if (previous && !previous.lexeme.startsWith("/#") && previous.endLine === token.line - 1) {
        previous.lexeme += `\n${text}`;
        previous.endLine = token.line;
      } else {
        comments.push({ lexeme: text, endLine: token.line });
      }
    }

    if (comments.length === 0) return;

    const processNode = (node: AST.ASTNode) => {
      const startLine = node.location.startLine;
      // Find comment that ends exactly on the line before the node starts
      // We could allow a gap, but strict adjacency is safer for now
      const comment = comments.find((c) => c.endLine === startLine - 1);
      if (comment) {
        let cleanDoc = comment.lexeme;
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
