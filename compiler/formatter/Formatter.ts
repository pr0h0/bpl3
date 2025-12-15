import * as AST from "../common/AST";
import { TokenType } from "../frontend/TokenType";
import { Token } from "../frontend/Token";

export class Formatter {
  private indentLevel: number = 0;
  private indentString: string = "    "; // 4 spaces
  private comments: Token[] = [];
  private currentCommentIndex: number = 0;
  private lastLineProcessed: number = 0;

  format(program: AST.Program): string {
    this.indentLevel = 0;
    this.comments = program.comments || [];
    // Sort comments by position
    this.comments.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.column - b.column;
    });
    this.currentCommentIndex = 0;
    this.lastLineProcessed = 0;

    let output = this.formatStatements(program.statements);

    // Print remaining comments
    output += this.printRemainingComments();

    return output.trim() + "\n";
  }

  private printCommentsBefore(line: number): string {
    let output = "";
    while (this.currentCommentIndex < this.comments.length) {
      const comment = this.comments[this.currentCommentIndex];
      if (comment && comment.line < line) {
        // Check for gap before comment
        if (
          this.lastLineProcessed > 0 &&
          comment.line > this.lastLineProcessed + 1
        ) {
          output += "\n";
        }

        const indent = this.getIndent();
        output += `${indent}${comment.lexeme}\n`;

        // Update lastLineProcessed
        // Estimate comment height based on newlines in lexeme
        const lines = comment.lexeme.split("\n").length;
        this.lastLineProcessed = comment.line + lines - 1;

        this.currentCommentIndex++;
      } else {
        break;
      }
    }
    return output;
  }

  private getInlineComment(line: number): string {
    // Check if there's a comment on the same line
    if (this.currentCommentIndex < this.comments.length) {
      const comment = this.comments[this.currentCommentIndex];
      if (comment && comment.line === line) {
        this.currentCommentIndex++;
        return ` ${comment.lexeme}`;
      }
    }
    return "";
  }

  private printRemainingComments(): string {
    let output = "";
    while (this.currentCommentIndex < this.comments.length) {
      const comment = this.comments[this.currentCommentIndex];
      if (comment) {
        const indent = this.getIndent();
        output += `\n${indent}${comment.lexeme}`;
      }
      this.currentCommentIndex++;
    }
    return output;
  }

  private formatStatements(statements: AST.Statement[]): string {
    let output = "";
    for (const stmt of statements) {
      output += this.printCommentsBefore(stmt.location.startLine);

      // Check for gap before statement (after comments)
      if (
        this.lastLineProcessed > 0 &&
        stmt.location.startLine > this.lastLineProcessed + 1
      ) {
        output += "\n";
      }

      const formatted = this.formatStatement(stmt);
      const inlineComment = this.getInlineComment(stmt.location.endLine);
      output += formatted + inlineComment;
      output += "\n";

      this.lastLineProcessed = stmt.location.endLine;
    }
    return output;
  }

  private formatStatement(stmt: AST.Statement): string {
    const indent = this.getIndent();
    switch (stmt.kind) {
      case "VariableDecl":
        return this.formatVariableDecl(stmt as AST.VariableDecl);
      case "FunctionDecl":
        return this.formatFunctionDecl(stmt as AST.FunctionDecl);
      case "StructDecl":
        return this.formatStructDecl(stmt as AST.StructDecl);
      case "TypeAlias":
        return this.formatTypeAlias(stmt as AST.TypeAliasDecl);
      case "Import":
        return this.formatImport(stmt as AST.ImportStmt);
      case "Export":
        return this.formatExport(stmt as AST.ExportStmt);
      case "Extern":
        return this.formatExtern(stmt as AST.ExternDecl);
      case "Asm":
        return this.formatAsm(stmt as AST.AsmBlockStmt);
      case "If":
        return this.formatIf(stmt as AST.IfStmt);
      case "Loop":
        return this.formatLoop(stmt as AST.LoopStmt);
      case "Return":
        return this.formatReturn(stmt as AST.ReturnStmt);
      case "Break":
        return `${indent}break;`;
      case "Continue":
        return `${indent}continue;`;
      case "Block":
        return this.formatBlock(stmt as AST.BlockStmt);
      case "Try":
        return this.formatTry(stmt as AST.TryStmt);
      case "Throw":
        return this.formatThrow(stmt as AST.ThrowStmt);
      case "Switch":
        return this.formatSwitch(stmt as AST.SwitchStmt);
      case "ExpressionStmt":
        return `${indent}${this.formatExpression(
          (stmt as AST.ExpressionStmt).expression,
        )};`;
      default:
        return `${indent}// Unknown statement kind: ${(stmt as any).kind}`;
    }
  }

  private formatVariableDecl(decl: AST.VariableDecl): string {
    const indent = this.getIndent();
    const keyword = decl.isGlobal ? "global" : "local";
    let output = `${indent}${keyword} `;

    if (typeof decl.name === "string") {
      output += decl.name;
      if (decl.typeAnnotation) {
        output += `: ${this.formatType(decl.typeAnnotation)}`;
      }
    } else {
      // Destructuring (may be nested)
      output += this.formatDestructPattern(decl.name);
    }

    if (decl.initializer) {
      output += ` = ${this.formatExpression(decl.initializer)}`;
    }

    output += ";";
    return output;
  }

  private formatDestructPattern(pattern: any): string {
    if (Array.isArray(pattern)) {
      // Nested array or list of targets
      return `(${pattern
        .map((item) => {
          if (Array.isArray(item)) {
            // Nested destructuring
            return this.formatDestructPattern(item);
          } else if (typeof item === "object" && item.name) {
            // Single target
            return `${item.name}${
              item.type ? `: ${this.formatType(item.type)}` : ""
            }`;
          }
          return "";
        })
        .join(", ")})`;
    }
    return "";
  }

  private formatFunctionDecl(decl: AST.FunctionDecl): string {
    const indent = this.getIndent();
    let output = `${indent}frame ${decl.name}`;

    if (decl.genericParams.length > 0) {
      output += `<${decl.genericParams.join(", ")}>`;
    }

    output += "(";
    output += decl.params
      .map((p) => `${p.name}: ${this.formatType(p.type)}`)
      .join(", ");
    output += ")";

    if (
      decl.returnType &&
      (decl.returnType.kind !== "BasicType" || decl.returnType.name !== "void")
    ) {
      output += ` ret ${this.formatType(decl.returnType)}`;
    }

    output += " ";
    output += this.formatBlock(decl.body, false); // Block handles indentation
    return output;
  }

  private formatStructDecl(decl: AST.StructDecl): string {
    const indent = this.getIndent();
    let output = `${indent}struct ${decl.name}`;

    if (decl.genericParams.length > 0) {
      output += `<${decl.genericParams.join(", ")}>`;
    }

    if (decl.parentType) {
      output += ` : ${this.formatType(decl.parentType)}`;
    }

    output += " {\n";
    this.indentLevel++;

    this.lastLineProcessed = decl.location.startLine;

    for (const member of decl.members) {
      // Print comments before member
      output += this.printCommentsBefore(member.location.startLine);

      if (
        this.lastLineProcessed > 0 &&
        member.location.startLine > this.lastLineProcessed + 1
      ) {
        output += "\n";
      }

      if (member.kind === "StructField") {
        output += `${this.getIndent()}${member.name}: ${this.formatType(
          member.type,
        )},\n`;
      } else if (member.kind === "FunctionDecl") {
        output += this.formatFunctionDecl(member as AST.FunctionDecl) + "\n";
      }

      this.lastLineProcessed = member.location.endLine;
    }

    // Print comments inside struct (before closing brace)
    output += this.printCommentsBefore(decl.location.endLine);

    this.indentLevel--;
    output += `${indent}}`;
    return output;
  }

  private formatTypeAlias(decl: AST.TypeAliasDecl): string {
    const indent = this.getIndent();
    let output = `${indent}type ${decl.name}`;

    if (decl.genericParams.length > 0) {
      output += `<${decl.genericParams.join(", ")}>`;
    }

    output += ` = ${this.formatType(decl.type)};`;
    return output;
  }

  private formatImport(stmt: AST.ImportStmt): string {
    const indent = this.getIndent();
    let output = `${indent}import `;

    if (stmt.importAll) {
      output += "*";
      if (stmt.namespace) {
        output += ` as ${stmt.namespace}`;
      }
    } else {
      output += stmt.items
        .map((item) => (item.isType ? `[${item.name}]` : item.name))
        .join(", ");
    }

    output += ` from "${stmt.source}";`;
    return output;
  }

  private formatExport(stmt: AST.ExportStmt): string {
    const indent = this.getIndent();
    let output = `${indent}export `;
    if (stmt.isType) {
      output += `[${stmt.item}]`;
    } else {
      output += stmt.item;
    }
    output += ";";
    return output;
  }

  private formatExtern(decl: AST.ExternDecl): string {
    const indent = this.getIndent();
    let output = `${indent}extern ${decl.name}(`;

    output += decl.params
      .map((p) => `${p.name}: ${this.formatType(p.type)}`)
      .join(", ");

    if (decl.isVariadic) {
      if (decl.params.length > 0) output += ", ";
      output += "...";
    }

    output += ")";

    if (decl.returnType) {
      output += ` ret ${this.formatType(decl.returnType)}`;
    }

    output += ";";
    return output;
  }

  private formatAsm(stmt: AST.AsmBlockStmt): string {
    const indent = this.getIndent();
    return `${indent}asm { ${stmt.content} }`;
  }

  private formatIf(stmt: AST.IfStmt): string {
    const indent = this.getIndent();
    let output = `${indent}if (${this.formatExpression(stmt.condition)}) `;
    output += this.formatBlock(stmt.thenBranch, false);

    if (stmt.elseBranch) {
      output += " else ";
      if (stmt.elseBranch.kind === "If") {
        // Else if
        // We need to trim the indentation of the nested if
        const elseIf = this.formatIf(stmt.elseBranch as AST.IfStmt).trim();
        output += elseIf;
      } else if (stmt.elseBranch.kind === "Block") {
        output += this.formatBlock(stmt.elseBranch as AST.BlockStmt, false);
      } else {
        // Single statement else
        output += "\n";
        this.indentLevel++;
        output += this.formatStatement(stmt.elseBranch);
        this.indentLevel--;
      }
    }

    return output;
  }

  private formatLoop(stmt: AST.LoopStmt): string {
    const indent = this.getIndent();
    let output = `${indent}loop`;
    if (stmt.condition) {
      output += ` (${this.formatExpression(stmt.condition)})`;
    }
    output += " ";
    output += this.formatBlock(stmt.body, false);
    return output;
  }

  private formatReturn(stmt: AST.ReturnStmt): string {
    const indent = this.getIndent();
    let output = `${indent}return`;
    if (stmt.value) {
      output += ` ${this.formatExpression(stmt.value)}`;
    }
    output += ";";
    return output;
  }

  private formatBlock(
    stmt: AST.BlockStmt,
    indentFirstLine: boolean = true,
  ): string {
    let output = "";
    if (indentFirstLine) {
      output += this.getIndent();
    }
    output += "{\n";
    this.indentLevel++;

    // Update lastLineProcessed to the start of the block so inner statements
    // don't get extra padding relative to the opening brace.
    this.lastLineProcessed = stmt.location.startLine;

    output += this.formatStatements(stmt.statements);

    // Print comments inside the block (before the closing brace)
    output += this.printCommentsBefore(stmt.location.endLine);

    this.indentLevel--;
    output += `${this.getIndent()}}`;
    return output;
  }

  private formatTry(stmt: AST.TryStmt): string {
    const indent = this.getIndent();
    let output = `${indent}try `;
    output += this.formatBlock(stmt.tryBlock, false);

    for (const clause of stmt.catchClauses) {
      output += ` catch (${clause.variable}: ${this.formatType(clause.type)}) `;
      output += this.formatBlock(clause.body, false);
    }

    if (stmt.catchOther) {
      output += " catchOther ";
      output += this.formatBlock(stmt.catchOther, false);
    }

    return output;
  }

  private formatThrow(stmt: AST.ThrowStmt): string {
    const indent = this.getIndent();
    return `${indent}throw ${this.formatExpression(stmt.expression)};`;
  }

  private formatSwitch(stmt: AST.SwitchStmt): string {
    const indent = this.getIndent();
    let output = `${indent}switch (${this.formatExpression(
      stmt.expression,
    )}) {\n`;
    this.indentLevel++;

    this.lastLineProcessed = stmt.location.startLine;

    for (const kase of stmt.cases) {
      output += this.printCommentsBefore(kase.location.startLine);

      if (
        this.lastLineProcessed > 0 &&
        kase.location.startLine > this.lastLineProcessed + 1
      ) {
        output += "\n";
      }

      output += `${this.getIndent()}case ${this.formatExpression(
        kase.value,
      )}: `;
      output += this.formatBlock(kase.body, false);
      output += "\n";

      this.lastLineProcessed = kase.location.endLine;
    }

    if (stmt.defaultCase) {
      // Default case doesn't have explicit location in AST usually, but block does
      output += this.printCommentsBefore(stmt.defaultCase.location.startLine);

      if (
        this.lastLineProcessed > 0 &&
        stmt.defaultCase.location.startLine > this.lastLineProcessed + 1
      ) {
        output += "\n";
      }

      output += `${this.getIndent()}default: `;
      output += this.formatBlock(stmt.defaultCase, false);
      output += "\n";

      this.lastLineProcessed = stmt.defaultCase.location.endLine;
    }

    output += this.printCommentsBefore(stmt.location.endLine);

    this.indentLevel--;
    output += `${indent}}`;
    return output;
  }

  // --- Expressions ---

  private formatExpression(expr: AST.Expression): string {
    switch (expr.kind) {
      case "Literal":
        return this.formatLiteral(expr as AST.LiteralExpr);
      case "Identifier":
        return (expr as AST.IdentifierExpr).name;
      case "Binary":
        return this.formatBinary(expr as AST.BinaryExpr);
      case "Unary":
        return this.formatUnary(expr as AST.UnaryExpr);
      case "Call":
        return this.formatCall(expr as AST.CallExpr);
      case "Member":
        return this.formatMember(expr as AST.MemberExpr);
      case "Index":
        return this.formatIndex(expr as AST.IndexExpr);
      case "Assignment":
        return this.formatAssignment(expr as AST.AssignmentExpr);
      case "Ternary":
        return this.formatTernary(expr as AST.TernaryExpr);
      case "Cast":
        return this.formatCast(expr as AST.CastExpr);
      case "Sizeof":
        return this.formatSizeof(expr as AST.SizeofExpr);
      case "Match":
        return this.formatMatch(expr as AST.MatchExpr);
      case "ArrayLiteral":
        return this.formatArrayLiteral(expr as AST.ArrayLiteralExpr);
      case "StructLiteral":
        return this.formatStructLiteral(expr as AST.StructLiteralExpr);
      case "TupleLiteral":
        return this.formatTupleLiteral(expr as AST.TupleLiteralExpr);
      case "GenericInstantiation":
        return this.formatGenericInstantiation(
          expr as AST.GenericInstantiationExpr,
        );
      default:
        return `/* Unknown expr: ${(expr as AST.Expression).kind} */`;
    }
  }

  private formatLiteral(expr: AST.LiteralExpr): string {
    // Preserve original literal lexeme to avoid changing escapes
    return expr.raw;
  }

  private formatBinary(expr: AST.BinaryExpr): string {
    const op = expr.operator.lexeme;
    const prec = this.getPrecedence(op);

    const left = expr.left;
    const right = expr.right;

    let leftStr = this.formatExpression(left);
    let rightStr = this.formatExpression(right);

    // Always parenthesize ternary when nested inside binary
    if (left.kind === "Ternary") leftStr = `(${leftStr})`;
    if (right.kind === "Ternary") rightStr = `(${rightStr})`;

    // Add parentheses when child binary has lower or equal precedence that could alter grouping
    if (left.kind === "Binary") {
      const childOp = (left as AST.BinaryExpr).operator.lexeme;
      const childPrec = this.getPrecedence(childOp);
      if (
        childPrec < prec ||
        this.requiresParenForEqualPrecedence(childOp, op, true) ||
        this.parenthesizeBitwiseInsideComparison(childOp, op)
      ) {
        leftStr = `(${leftStr})`;
      }
    }

    if (right.kind === "Binary") {
      const childOp = (right as AST.BinaryExpr).operator.lexeme;
      const childPrec = this.getPrecedence(childOp);
      if (
        childPrec < prec ||
        this.requiresParenForEqualPrecedence(childOp, op, false) ||
        this.parenthesizeBitwiseInsideComparison(childOp, op)
      ) {
        rightStr = `(${rightStr})`;
      }
    }

    return `${leftStr} ${op} ${rightStr}`;
  }

  private formatUnary(expr: AST.UnaryExpr): string {
    const operandIsComplex =
      expr.operand.kind === "Binary" || expr.operand.kind === "Ternary";
    const operandStr = this.formatExpression(expr.operand);
    const wrappedOperand = operandIsComplex ? `(${operandStr})` : operandStr;
    if (expr.isPrefix) {
      return `${expr.operator.lexeme}${wrappedOperand}`;
    } else {
      return `${wrappedOperand}${expr.operator.lexeme}`;
    }
  }

  private formatCall(expr: AST.CallExpr): string {
    let output = this.formatExpression(expr.callee);
    if (expr.genericArgs.length > 0) {
      output += `<${expr.genericArgs
        .map((t) => this.formatType(t))
        .join(", ")}>`;
    }
    output += "(";
    output += expr.args.map((a) => this.formatExpression(a)).join(", ");
    output += ")";
    return output;
  }

  private formatMember(expr: AST.MemberExpr): string {
    return `${this.formatExpression(expr.object)}.${expr.property}`;
  }

  private formatIndex(expr: AST.IndexExpr): string {
    return `${this.formatExpression(expr.object)}[${this.formatExpression(
      expr.index,
    )}]`;
  }

  private formatAssignment(expr: AST.AssignmentExpr): string {
    return `${this.formatExpression(expr.assignee)} ${
      expr.operator.lexeme
    } ${this.formatExpression(expr.value)}`;
  }

  private formatTernary(expr: AST.TernaryExpr): string {
    return `${this.formatExpression(expr.condition)} ? ${this.formatExpression(
      expr.trueExpr,
    )} : ${this.formatExpression(expr.falseExpr)}`;
  }

  private formatCast(expr: AST.CastExpr): string {
    return `cast<${this.formatType(expr.targetType)}>(${this.formatExpression(
      expr.expression,
    )})`;
  }

  private formatSizeof(expr: AST.SizeofExpr): string {
    if ("kind" in expr.target && (expr.target as any).kind === "BasicType") {
      return `sizeof<${this.formatType(expr.target as AST.TypeNode)}>()`;
    } else {
      return `sizeof(${this.formatExpression(expr.target as AST.Expression)})`;
    }
  }

  private formatMatch(expr: AST.MatchExpr): string {
    return `match<${this.formatType(expr.targetType)}>(${this.formatExpression(
      expr.value as AST.Expression,
    )})`;
  }

  private formatArrayLiteral(expr: AST.ArrayLiteralExpr): string {
    return `[${expr.elements.map((e) => this.formatExpression(e)).join(", ")}]`;
  }

  private formatStructLiteral(expr: AST.StructLiteralExpr): string {
    let output = `${expr.structName} {`;
    if (expr.fields.length > 0) {
      output += " ";
      output += expr.fields
        .map((f) => `${f.name}: ${this.formatExpression(f.value)}`)
        .join(", ");
      output += " ";
    }
    output += "}";
    return output;
  }

  private formatTupleLiteral(expr: AST.TupleLiteralExpr): string {
    return `(${expr.elements.map((e) => this.formatExpression(e)).join(", ")})`;
  }

  private formatGenericInstantiation(
    expr: AST.GenericInstantiationExpr,
  ): string {
    return `${this.formatExpression(expr.base)}<${expr.genericArgs
      .map((t) => this.formatType(t))
      .join(", ")}>`;
  }

  // --- Types ---

  private formatType(type: AST.TypeNode): string {
    switch (type.kind) {
      case "BasicType":
        let output = "";
        for (let i = 0; i < type.pointerDepth; i++) output += "*";
        output += type.name;
        if (type.genericArgs.length > 0) {
          output += `<${type.genericArgs
            .map((t) => this.formatType(t))
            .join(", ")}>`;
        }
        for (const dim of type.arrayDimensions) {
          output += `[${dim !== null ? dim : ""}]`;
        }
        return output;
      case "FunctionType":
        let func = `Func<${this.formatType(type.returnType)}>(`;
        func += type.paramTypes.map((t) => this.formatType(t)).join(", ");
        func += ")";
        return func;
      case "TupleType":
        return `(${type.types.map((t) => this.formatType(t)).join(", ")})`;
      default:
        return "unknown_type";
    }
  }

  private getIndent(): string {
    return this.indentString.repeat(this.indentLevel);
  }

  // --- Precedence helpers ---
  private getPrecedence(op: string): number {
    switch (op) {
      case "||":
        return 1;
      case "&&":
        return 2;
      case "|":
        return 3;
      case "^":
        return 4;
      case "&":
        return 5;
      case "==":
      case "!=":
        return 6;
      case "<":
      case "<=":
      case ">":
      case ">=":
        return 7;
      case "<<":
      case ">>":
        return 8;
      case "+":
      case "-":
        return 9;
      case "*":
      case "/":
      case "%":
        return 10;
      default:
        return 0; // unknown or assignment handled elsewhere
    }
  }

  private requiresParenForEqualPrecedence(
    childOp: string,
    parentOp: string,
    isLeft: boolean,
  ): boolean {
    // For equal precedence but different operators, parentheses help preserve AST grouping
    if (childOp !== parentOp) return true;
    // For non-associative ops like comparisons and equality, parenthesize
    const nonAssoc = ["==", "!=", "<", "<=", ">", ">="];
    if (nonAssoc.includes(parentOp)) return true;
    // For right side of left-associative ops, adding parens avoids re-grouping
    if (!isLeft) {
      const leftAssoc = ["|", "^", "&", "<<", ">>", "+", "-", "*", "/", "%"];
      if (leftAssoc.includes(parentOp)) return true;
    }
    return false;
  }

  private parenthesizeBitwiseInsideComparison(
    childOp: string,
    parentOp: string,
  ): boolean {
    const comparisons = ["==", "!=", "<", "<=", ">", ">="];
    const bitwise = ["|", "^", "&", "<<", ">>"];
    return comparisons.includes(parentOp) && bitwise.includes(childOp);
  }
}
