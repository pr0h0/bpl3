import {
  CodeLens,
  type CodeLensParams,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Provides code lens - clickable metadata above functions/structs
 */
export class CodeLensProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Provide code lenses for a document
   */
  provide(params: CodeLensParams, document: TextDocument): CodeLens[] {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return [];

    const lenses: CodeLens[] = [];

    // Add code lenses for functions
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        const funcLenses = this.createFunctionLenses(func, filePath);
        lenses.push(...funcLenses);
      } else if (stmt.kind === "StructDecl") {
        const struct = stmt as AST.StructDecl;
        const structLenses = this.createStructLenses(struct, filePath);
        lenses.push(...structLenses);

        // Add lenses for methods
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            const methodLenses = this.createFunctionLenses(method, filePath);
            lenses.push(...methodLenses);
          }
        }
      }
    }

    return lenses;
  }

  /**
   * Resolve code lens (add command)
   * Called when the lens becomes visible
   */
  resolve(lens: CodeLens): CodeLens {
    // The command is already set, just return it
    return lens;
  }

  /**
   * Create code lenses for a function
   */
  private createFunctionLenses(
    func: AST.FunctionDecl,
    filePath: string,
  ): CodeLens[] {
    const lenses: CodeLens[] = [];
    const range = this.nodeToRange(func);
    if (!range) return lenses;

    // Create a range for just the function signature (first line)
    const headerRange = Range.create(
      range.start.line,
      range.start.character,
      range.start.line,
      range.start.character + func.name.length + 6, // "frame " + name
    );

    // Count references to this function
    const refCount = this.countReferences(func.name, filePath);

    // Add "X references" lens
    lenses.push({
      range: headerRange,
      command: {
        title: refCount === 1 ? "1 reference" : `${refCount} references`,
        command: "editor.action.showReferences",
        arguments: [
          `file://${filePath}`,
          { line: range.start.line, character: range.start.character },
          [], // References will be computed by the editor
        ],
      },
    });

    // Add complexity metric if function has a body
    if (func.body) {
      const complexity = this.calculateComplexity(func.body);
      if (complexity > 1) {
        lenses.push({
          range: headerRange,
          command: {
            title: `complexity: ${complexity}`,
            command: "",
          },
        });
      }
    }

    // Add "Run File" lens for main function
    if (func.name === "main") {
      lenses.push({
        range: headerRange,
        command: {
          title: "▶ Run File",
          command: "bpl.runFile",
          arguments: [filePath],
        },
      });
    }

    return lenses;
  }

  /**
   * Create code lenses for a struct
   */
  private createStructLenses(
    struct: AST.StructDecl,
    filePath: string,
  ): CodeLens[] {
    const lenses: CodeLens[] = [];
    const range = this.nodeToRange(struct);
    if (!range) return lenses;

    // Create a range for just the struct name
    const headerRange = Range.create(
      range.start.line,
      range.start.character,
      range.start.line,
      range.start.character + struct.name.length + 7, // "struct " + name
    );

    // Count implementations (how many times this struct is instantiated or extended)
    const implCount = this.countImplementations(struct.name, filePath);

    if (implCount > 0) {
      lenses.push({
        range: headerRange,
        command: {
          title:
            implCount === 1
              ? "1 implementation"
              : `${implCount} implementations`,
          command: "editor.action.showReferences",
          arguments: [
            `file://${filePath}`,
            { line: range.start.line, character: range.start.character },
            [],
          ],
        },
      });
    }

    // Show member count
    const methodCount = struct.members.filter(
      (m) => m.kind === "FunctionDecl",
    ).length;
    const fieldCount = struct.members.filter(
      (m) => m.kind === "StructField",
    ).length;

    if (methodCount > 0 || fieldCount > 0) {
      const parts: string[] = [];
      if (methodCount > 0)
        parts.push(`${methodCount} method${methodCount === 1 ? "" : "s"}`);
      if (fieldCount > 0)
        parts.push(`${fieldCount} field${fieldCount === 1 ? "" : "s"}`);

      lenses.push({
        range: headerRange,
        command: {
          title: parts.join(", "),
          command: "",
        },
      });
    }

    return lenses;
  }

  /**
   * Count references to a symbol (simple heuristic)
   */
  private countReferences(name: string, _filePath: string): number {
    let count = 0;
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const fp of allFiles) {
      const ast = this.astResolver.getCachedAST(fp);
      if (!ast) continue;

      // Count identifier occurrences
      count += this.countIdentifierOccurrences(ast, name);
    }

    return count;
  }

  /**
   * Count implementations of a struct
   */
  private countImplementations(structName: string, _filePath: string): number {
    let count = 0;
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const fp of allFiles) {
      const ast = this.astResolver.getCachedAST(fp);
      if (!ast) continue;

      // Count struct instantiations and inheritance
      count += this.countStructUsages(ast, structName);
    }

    return count;
  }

  /**
   * Count identifier occurrences in AST
   */
  private countIdentifierOccurrences(
    node: AST.Program | AST.Statement | AST.Expression,
    name: string,
  ): number {
    let count = 0;

    const visit = (n: any) => {
      if (!n) return;

      if (n.kind === "Identifier" && n.name === name) {
        count++;
      }

      // Recurse into all properties
      for (const key in n) {
        const value = n[key];
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (typeof value === "object" && value !== null) {
          visit(value);
        }
      }
    };

    visit(node);
    return count;
  }

  /**
   * Count struct usages (instantiations and inheritance)
   */
  private countStructUsages(ast: AST.Program, structName: string): number {
    let count = 0;

    const visit = (n: any) => {
      if (!n) return;

      // Check for struct instantiation in StructLiteral
      if (n.kind === "StructLiteral" && n.type) {
        if (n.type.kind === "NamedType" && n.type.name === structName) {
          count++;
        }
      }

      // Check for inheritance
      if (n.kind === "StructDecl" && n.baseType) {
        if (n.baseType.kind === "NamedType" && n.baseType.name === structName) {
          count++;
        }
      }

      // Recurse
      for (const key in n) {
        const value = n[key];
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (typeof value === "object" && value !== null) {
          visit(value);
        }
      }
    };

    visit(ast);
    return count;
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateComplexity(node: AST.Statement | AST.Expression): number {
    let complexity = 1; // Base complexity

    const visit = (n: AST.Statement | AST.Expression) => {
      switch (n.kind) {
        case "If":
          complexity++;
          const ifStmt = n as AST.IfStmt;
          if (ifStmt.thenBranch) visit(ifStmt.thenBranch);
          if (ifStmt.elseBranch) visit(ifStmt.elseBranch);
          break;

        case "Loop":
          complexity++;
          const loop = n as AST.LoopStmt;
          if (loop.body) visit(loop.body);
          break;

        case "Switch":
          const switchStmt = n as AST.SwitchStmt;
          complexity += switchStmt.cases.length;
          switchStmt.cases.forEach((c) => {
            if (c.body) visit(c.body);
          });
          break;

        case "Match":
          const match = n as AST.MatchExpr;
          complexity += match.arms.length;
          match.arms.forEach((arm) => {
            if (arm.body) visit(arm.body);
          });
          break;

        case "Binary":
          const binary = n as AST.BinaryExpr;
          const op =
            typeof binary.operator === "string"
              ? binary.operator
              : (binary.operator as any).type || "";
          if (op === "&&" || op === "||") {
            complexity++;
          }
          visit(binary.left);
          visit(binary.right);
          break;

        case "Block":
          (n as AST.BlockStmt).statements.forEach(visit);
          break;

        case "ExpressionStmt":
          visit((n as AST.ExpressionStmt).expression);
          break;

        case "Return":
          const ret = n as AST.ReturnStmt;
          if (ret.value) visit(ret.value);
          break;

        case "Try":
          const tryStmt = n as AST.TryStmt;
          complexity += tryStmt.catchClauses.length;
          if (tryStmt.tryBlock) visit(tryStmt.tryBlock);
          tryStmt.catchClauses.forEach((c) => visit(c.body));
          break;
      }
    };

    visit(node);
    return complexity;
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
