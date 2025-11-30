import Expression from "../../parser/expression/expr";
import ProgramExpr from "../../parser/expression/programExpr";
import ExpressionType from "../../parser/expressionType";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import BlockExpr from "../../parser/expression/blockExpr";
import IfExpr from "../../parser/expression/ifExpr";
import LoopExpr from "../../parser/expression/loopExpr";
import BinaryExpr from "../../parser/expression/binaryExpr";
import FunctionCallExpr from "../../parser/expression/functionCallExpr";
import ReturnExpr from "../../parser/expression/returnExpr";
import ImportExpr from "../../parser/expression/importExpr";
import ExportExpr from "../../parser/expression/exportExpr";
import ExternDeclarationExpr from "../../parser/expression/externDeclarationExpr";
import StructDeclarationExpr from "../../parser/expression/structDeclarationExpr";
import IdentifierExpr from "../../parser/expression/identifierExpr";
import NumberLiteralExpr from "../../parser/expression/numberLiteralExpr";
import StringLiteralExpr from "../../parser/expression/stringLiteralExpr";
import MemberAccessExpr from "../../parser/expression/memberAccessExpr";
import ArrayLiteralExpr from "../../parser/expression/arrayLiteralExpr";
import AsmBlockExpr from "../../parser/expression/asmBlockExpr";
import UnaryExpr from "../../parser/expression/unaryExpr";
import TernaryExpr from "../../parser/expression/ternaryExpr";
import SwitchExpr from "../../parser/expression/switchExpr";
import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";

export class Formatter {
  public indentLevel = 0;
  private indentString = "    ";
  private comments: Token[] = [];
  private currentCommentIndex = 0;
  private sourceCode: string = "";

  constructor(indentString: string = "    ", comments: Token[] = [], sourceCode: string = "") {
    this.indentString = indentString;
    this.comments = comments;
    this.sourceCode = sourceCode;
  }

  public format(program: ProgramExpr): string {
    return this.visitBlock(program.expressions, false) + "\n";
  }

  private indent(): string {
    return this.indentString.repeat(this.indentLevel);
  }

  private getTrailingComment(line: number): string {
    if (
      this.currentCommentIndex < this.comments.length &&
      this.comments[this.currentCommentIndex] &&
      this.comments[this.currentCommentIndex]!.line === line
    ) {
      const comment = this.comments[this.currentCommentIndex]!;
      this.currentCommentIndex++;
      return " " + comment.value;
    }
    return "";
  }

  private visit(expr: Expression): string {
    switch (expr.type) {
      case ExpressionType.Program:
        return this.format(expr as ProgramExpr);
      case ExpressionType.VariableDeclaration:
        return this.visitVariableDeclaration(expr as VariableDeclarationExpr);
      case ExpressionType.FunctionDeclaration:
        return this.visitFunctionDeclaration(expr as FunctionDeclarationExpr);
      case ExpressionType.BlockExpression:
        return this.visitBlockExpr(expr as BlockExpr);
      case ExpressionType.IfExpression:
        return this.visitIfExpr(expr as IfExpr);
      case ExpressionType.LoopExpression:
        return this.visitLoopExpr(expr as LoopExpr);
      case ExpressionType.BinaryExpression:
        return this.visitBinaryExpr(expr as BinaryExpr);
      case ExpressionType.FunctionCall:
        return this.visitFunctionCall(expr as FunctionCallExpr);
      case ExpressionType.ReturnExpression:
        return this.visitReturnExpr(expr as ReturnExpr);
      case ExpressionType.ImportExpression:
        return this.visitImportExpr(expr as ImportExpr);
      case ExpressionType.ExportExpression:
        return this.visitExportExpr(expr as ExportExpr);
      case ExpressionType.ExternDeclaration:
        return this.visitExternDeclaration(expr as ExternDeclarationExpr);
      case ExpressionType.StructureDeclaration:
        return this.visitStructDeclaration(expr as StructDeclarationExpr);
      case ExpressionType.IdentifierExpr:
        return this.visitIdentifier(expr as IdentifierExpr);
      case ExpressionType.NumberLiteralExpr:
        return this.visitNumberLiteral(expr as NumberLiteralExpr);
      case ExpressionType.StringLiteralExpr:
        return this.visitStringLiteral(expr as StringLiteralExpr);
      case ExpressionType.MemberAccessExpression:
        return this.visitMemberAccess(expr as MemberAccessExpr);
      case ExpressionType.ArrayLiteralExpr:
        return this.visitArrayLiteral(expr as ArrayLiteralExpr);
      case ExpressionType.AsmBlockExpression:
        return this.visitAsmBlock(expr as AsmBlockExpr);
      case ExpressionType.UnaryExpression:
        return this.visitUnaryExpr(expr as UnaryExpr);
      case ExpressionType.TernaryExpression:
        return this.visitTernaryExpr(expr as TernaryExpr);
      case ExpressionType.SwitchExpression:
        return this.visitSwitchExpr(expr as SwitchExpr);
      case ExpressionType.BreakExpression:
        return "break";
      case ExpressionType.ContinueExpression:
        return "continue";
      case ExpressionType.NullLiteralExpr:
        return "NULL";
      case ExpressionType.EOF:
        return "\n";
      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }

  private visitBlock(
    expressions: Expression[],
    indent: boolean = true,
    startLine: number = -1,
    endLine: number = -1,
  ): string {
    const lines: string[] = [];
    let lastLine = startLine;

    for (const expr of expressions) {
      if (expr.type === ExpressionType.EOF) continue;

      if (expr.startToken) {
        while (
          this.currentCommentIndex < this.comments.length &&
          this.comments[this.currentCommentIndex] &&
          this.comments[this.currentCommentIndex]!.line < expr.startToken.line
        ) {
          const comment = this.comments[this.currentCommentIndex]!;
          if (lastLine !== -1 && comment.line > lastLine + 1) {
            lines.push("");
          }
          lines.push(this.indent() + comment.value);
          lastLine = comment.line;
          this.currentCommentIndex++;
        }
      }

      if (lastLine !== -1 && expr.startToken) {
        const currentLine = expr.startToken.line;
        if (currentLine > lastLine + 1) {
          lines.push("");
        }
      }

      let line = this.visit(expr);

      if (this.needsSemicolon(expr)) {
        line += ";";
      }

      if (expr.endToken) {
        line += this.getTrailingComment(expr.endToken.line);
      } else if (expr.startToken) {
        line += this.getTrailingComment(expr.startToken.line);
      }

      if (line) {
        lines.push((indent ? this.indent() : "") + line);
      }

      if (expr.endToken) {
        lastLine = expr.endToken.line;
      } else if (expr.startToken) {
        lastLine = expr.startToken.line;
      }
    }

    if (endLine !== -1) {
      while (
        this.currentCommentIndex < this.comments.length &&
        this.comments[this.currentCommentIndex] &&
        this.comments[this.currentCommentIndex]!.line < endLine
      ) {
        const comment = this.comments[this.currentCommentIndex]!;
        if (lastLine !== -1 && comment.line > lastLine + 1) {
          lines.push("");
        }
        lines.push(this.indent() + comment.value);
        lastLine = comment.line;
        this.currentCommentIndex++;
      }
    } else if (!indent) {
      while (this.currentCommentIndex < this.comments.length) {
        const comment = this.comments[this.currentCommentIndex]!;
        if (lastLine !== -1 && comment.line > lastLine + 1) {
          lines.push("");
        }
        lines.push(comment.value);
        lastLine = comment.line;
        this.currentCommentIndex++;
      }
    }

    return lines.join("\n");
  }

  private needsSemicolon(expr: Expression): boolean {
    switch (expr.type) {
      case ExpressionType.FunctionCall:
      case ExpressionType.BinaryExpression:
      case ExpressionType.UnaryExpression:
      case ExpressionType.BreakExpression:
      case ExpressionType.ContinueExpression:
      case ExpressionType.MemberAccessExpression:
      case ExpressionType.ArrayLiteralExpr: // Unlikely to be a statement but possible
      case ExpressionType.IdentifierExpr: // Unlikely
      case ExpressionType.NumberLiteralExpr: // Unlikely
      case ExpressionType.StringLiteralExpr: // Unlikely
        return true;
      default:
        return false;
    }
  }

  private visitVariableDeclaration(expr: VariableDeclarationExpr): string {
    let output = "";
    if (expr.scope === "global") {
      output += "global ";
    } else {
      output += "local ";
    }
    if (expr.isConst) {
      output += "const ";
    }
    output += `${expr.name}: ${this.formatType(expr.varType)}`;
    if (expr.value) {
      output += ` = ${this.visit(expr.value)}`;
    }
    return output + ";";
  }

  private visitFunctionDeclaration(expr: FunctionDeclarationExpr): string {
    let output = `frame ${expr.name}(`;
    output += expr.args
      .map((arg) => `${arg.name}: ${this.formatType(arg.type)}`)
      .join(", ");
    
    if (expr.isVariadic) {
        if (expr.args.length > 0) output += ", ";
        output += `...:${this.formatType(expr.variadicType!)}`;
    }
    
    output += ")";
    if (expr.returnType) {
      output += ` ret ${this.formatType(expr.returnType)}`;
    }
    output += " ";
    output += this.visitBlockExpr(expr.body as BlockExpr);
    return output;
  }

  private visitBlockExpr(expr: BlockExpr): string {
    let output = "{";
    if (expr.startToken) {
        output += this.getTrailingComment(expr.startToken.line);
    }
    output += "\n";
    this.indentLevel++;
    output += this.visitBlock(
      expr.expressions,
      true,
      expr.startToken?.line,
      expr.endToken?.line,
    );
    this.indentLevel--;
    output += "\n" + this.indent() + "}";
    return output;
  }

  private visitIfExpr(expr: IfExpr): string {
    let output = `if ${this.visit(expr.condition)} `;
    output += this.visitBlockExpr(expr.thenBranch as BlockExpr);
    if (expr.elseBranch) {
      // Check for else if pattern
      const firstExpr = expr.elseBranch.expressions[0];
      if (
        expr.elseBranch.expressions.length === 1 &&
        firstExpr &&
        firstExpr.type === ExpressionType.IfExpression
      ) {
        output +=
          " else " +
          this.visitIfExpr(firstExpr as IfExpr);
      } else {
        output += " else " + this.visitBlockExpr(expr.elseBranch as BlockExpr);
      }
    }
    return output;
  }

  private visitLoopExpr(expr: LoopExpr): string {
    return `loop ${this.visitBlockExpr(expr.body as BlockExpr)}`;
  }

  private visitBinaryExpr(expr: BinaryExpr): string {
    const parentPrecedence = this.getPrecedence(expr);
    const leftPrecedence = this.getPrecedence(expr.left);
    const rightPrecedence = this.getPrecedence(expr.right);

    let leftStr = this.visit(expr.left);
    let rightStr = this.visit(expr.right);

    if (leftPrecedence < parentPrecedence) {
      leftStr = `(${leftStr})`;
    }

    // For right operand, we need to handle associativity
    // Most operators are left-associative, so if precedence is equal, we need parens on right
    // e.g. a - (b - c)
    // Assignment is right-associative, so if precedence is equal, we need parens on left (handled above)
    // but usually assignment chains a = b = c are parsed as a = (b = c)
    const isRightAssociative = [
      TokenType.ASSIGN,
      TokenType.PLUS_ASSIGN,
      TokenType.MINUS_ASSIGN,
      TokenType.STAR_ASSIGN,
      TokenType.SLASH_ASSIGN,
      TokenType.PERCENT_ASSIGN,
      TokenType.AMPERSAND_ASSIGN,
      TokenType.PIPE_ASSIGN,
      TokenType.CARET_ASSIGN,
    ].includes(expr.operator.type);

    if (
      rightPrecedence < parentPrecedence ||
      (!isRightAssociative && rightPrecedence === parentPrecedence)
    ) {
      rightStr = `(${rightStr})`;
    }

    return `${leftStr} ${expr.operator.value} ${rightStr}`;
  }

  private visitFunctionCall(expr: FunctionCallExpr): string {
    let output = `call ${expr.functionName}(`;
    output += expr.args.map((arg) => this.visit(arg)).join(", ");
    output += ")";
    return output;
  }

  private visitReturnExpr(expr: ReturnExpr): string {
    if (expr.value) {
      return `return ${this.visit(expr.value)};`;
    }
    return "return;";
  }

  private visitImportExpr(expr: ImportExpr): string {
    let output = "import ";
    const items: string[] = [];
    for (const item of expr.importName) {
        if (item.type === "type") {
            items.push(`[${item.name}]`);
        } else {
            items.push(item.name);
        }
    }
    output += items.join(", ");
    if (expr.moduleName) {
        output += ` from "${expr.moduleName}"`;
    }
    return output + ";";
  }

  private visitExportExpr(expr: ExportExpr): string {
    let output = "export ";
    if (expr.exportType === "type") {
        output += `[${expr.exportName}]`;
    } else {
        output += expr.exportName;
    }
    return output + ";";
  }

  private visitExternDeclaration(expr: ExternDeclarationExpr): string {
    let output = `extern ${expr.name}(`;
    output += expr.args
      .map((arg) => `${arg.name}: ${this.formatType(arg.type)}`)
      .join(", ");
    if (expr.isVariadic) {
        if (expr.args.length > 0) output += ", ";
        output += "...";
    }
    output += ")";
    if (expr.returnType) {
      output += ` ret ${this.formatType(expr.returnType)}`;
    }
    return output + ";";
  }

  private printCommentsUntil(line: number): string {
    let output = "";
    while (
      this.currentCommentIndex < this.comments.length &&
      this.comments[this.currentCommentIndex] &&
      this.comments[this.currentCommentIndex]!.line < line
    ) {
      const comment = this.comments[this.currentCommentIndex]!;
      output += this.indent() + comment.value + "\n";
      this.currentCommentIndex++;
    }
    return output;
  }

  private visitStructDeclaration(expr: StructDeclarationExpr): string {
    let output = `struct ${expr.name}`;
    if (expr.genericParams.length > 0) {
      output += `<${expr.genericParams.join(", ")}>`;
    }
    output += " {";
    if (expr.startToken) {
        output += this.getTrailingComment(expr.startToken.line);
    }
    output += "\n";

    this.indentLevel++;
    for (const field of expr.fields) {
      if (field.token) {
         output += this.printCommentsUntil(field.token.line);
      }
      output += this.indent() + `${field.name}: ${this.formatType(field.type)},`;
      if (field.token) {
          output += this.getTrailingComment(field.token.line);
      }
      output += "\n";
    }
    
    if (expr.endToken) {
        output += this.printCommentsUntil(expr.endToken.line);
    }

    this.indentLevel--;
    output += this.indent() + "}";
    return output;
  }

  private visitIdentifier(expr: IdentifierExpr): string {
    return expr.name;
  }

  private visitNumberLiteral(expr: NumberLiteralExpr): string {
    if (expr.token && expr.token.raw) {
      return expr.token.raw;
    }
    return expr.value;
  }

  private escapeString(value: string): string {
    return value
      // .replaceAll('\\', "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll('\n', "\\n")
      .replaceAll('\r', "\\r")
      .replaceAll('\t', "\\t");
  }

  private visitStringLiteral(expr: StringLiteralExpr): string {
    if (expr.token && expr.token.raw) {
      return expr.token.raw;
    }
    return `"${this.escapeString(expr.value)}"`;
  }

  private visitMemberAccess(expr: MemberAccessExpr): string {
    const objectPrecedence = this.getPrecedence(expr.object);
    const parentPrecedence = this.getPrecedence(expr);
    let objectStr = this.visit(expr.object);

    if (objectPrecedence < parentPrecedence) {
      objectStr = `(${objectStr})`;
    }

    if (expr.isIndexAccess) {
      return `${objectStr}[${this.visit(expr.property)}]`;
    } else {
      return `${objectStr}.${this.visit(expr.property)}`;
    }
  }

  private visitArrayLiteral(expr: ArrayLiteralExpr): string {
    return `[${expr.elements.map((e) => this.visit(e)).join(", ")}]`;
  }

  private visitAsmBlock(expr: AsmBlockExpr): string {
    if (this.sourceCode && expr.startToken && expr.endToken) {
        // Preserve exact formatting for ASM blocks
        const start = expr.startToken.start;
        const end = expr.endToken.start + (expr.endToken.raw ? expr.endToken.raw.length : 1);

        // Skip comments that are inside the block to avoid duplication
        while (
            this.currentCommentIndex < this.comments.length &&
            this.comments[this.currentCommentIndex]!.start < expr.endToken.start
        ) {
            this.currentCommentIndex++;
        }

        return this.sourceCode.slice(start, end);
    }

    let output = "asm {\n";
    this.indentLevel++;

    let lastLine = -1;
    let line = "";

    for (let i = 0; i < expr.code.length; i++) {
      const token = expr.code[i];
      if (!token) continue;

      if (lastLine !== -1 && token.line !== lastLine) {
        output += this.indent() + line.trim() + "\n";
        line = "";
      }
      lastLine = token.line;

      if (line.length > 0) {
        const prev = expr.code[i - 1];
        if (prev && this.shouldAddSpaceAsm(prev, token)) {
          line += " ";
        }
      }

      if (token.type === TokenType.STRING_LITERAL) {
        line += `"${this.escapeString(token.value)}"`;
      } else {
        line += token.value;
      }
    }
    if (line.length > 0) {
      output += this.indent() + line.trim() + "\n";
    }

    this.indentLevel--;
    output += this.indent() + "}";
    return output;
  }

  private shouldAddSpaceAsm(prev: Token, curr: Token): boolean {
    if (
      prev.type === TokenType.OPEN_PAREN ||
      prev.type === TokenType.OPEN_BRACKET
    )
      return false;
    if (
      curr.type === TokenType.CLOSE_PAREN ||
      curr.type === TokenType.CLOSE_BRACKET ||
      curr.type === TokenType.COMMA
    )
      return false;
    return true;
  }

  private visitUnaryExpr(expr: UnaryExpr): string {
    const parentPrecedence = this.getPrecedence(expr);
    const rightPrecedence = this.getPrecedence(expr.right);
    let rightStr = this.visit(expr.right);

    if (rightPrecedence < parentPrecedence) {
      rightStr = `(${rightStr})`;
    }

    return `${expr.operator.value}${rightStr}`;
  }

  private visitTernaryExpr(expr: TernaryExpr): string {
    return `${this.visit(expr.condition)} ? ${this.visit(expr.trueExpr)} : ${this.visit(expr.falseExpr)}`;
  }

  private visitSwitchExpr(expr: SwitchExpr): string {
    let output = `switch ${this.visit(expr.discriminant)} {`;
    if (expr.startToken) {
        output += this.getTrailingComment(expr.startToken.line);
    }
    output += "\n";
    this.indentLevel++;

    for (const c of expr.cases) {
        output += this.indent() + `case ${c.value.value}: `;
        output += this.visitBlockExpr(c.body);
        output += "\n";
    }

    if (expr.defaultCase) {
        output += this.indent() + "default: ";
        output += this.visitBlockExpr(expr.defaultCase);
        output += "\n";
    }

    this.indentLevel--;
    output += this.indent() + "}";
    return output;
  }

  private formatType(type: any): string {
    let s = type.name;
    if (type.genericArgs && type.genericArgs.length > 0) {
      s += `<${type.genericArgs.map((arg: any) => this.formatType(arg)).join(", ")}>`;
    }
    for (let i = 0; i < type.isPointer; i++) s = "*" + s;
    for (const dim of type.isArray) s += `[${dim}]`;
    return s;
  }

  private getPrecedence(expr: Expression): number {
    switch (expr.type) {
      case ExpressionType.MemberAccessExpression:
      case ExpressionType.FunctionCall:
      case ExpressionType.ArrayLiteralExpr: // Array access is usually MemberAccess
        return 18;
      case ExpressionType.UnaryExpression:
        return 15;
      case ExpressionType.BinaryExpression:
        const binExpr = expr as BinaryExpr;
        switch (binExpr.operator.type) {
          case TokenType.STAR:
          case TokenType.SLASH:
          case TokenType.PERCENT:
            return 13;
          case TokenType.PLUS:
          case TokenType.MINUS:
            return 12;
          case TokenType.BITSHIFT_LEFT:
          case TokenType.BITSHIFT_RIGHT:
            return 11;
          case TokenType.LESS_THAN:
          case TokenType.LESS_EQUAL:
          case TokenType.GREATER_THAN:
          case TokenType.GREATER_EQUAL:
            return 10;
          case TokenType.EQUAL:
          case TokenType.NOT_EQUAL:
            return 9;
          case TokenType.AMPERSAND:
            return 8;
          case TokenType.CARET:
            return 7;
          case TokenType.PIPE:
            return 6;
          case TokenType.AND:
            return 5;
          case TokenType.OR:
            return 4;
          case TokenType.ASSIGN:
          case TokenType.PLUS_ASSIGN:
          case TokenType.MINUS_ASSIGN:
          case TokenType.STAR_ASSIGN:
          case TokenType.SLASH_ASSIGN:
          case TokenType.PERCENT_ASSIGN:
          case TokenType.AMPERSAND_ASSIGN:
          case TokenType.PIPE_ASSIGN:
          case TokenType.CARET_ASSIGN:
            return 2;
          default:
            return 0;
        }
      case ExpressionType.TernaryExpression:
        return 3;
      case ExpressionType.IdentifierExpr:
      case ExpressionType.NumberLiteralExpr:
      case ExpressionType.StringLiteralExpr:
      case ExpressionType.NullLiteralExpr:
        return 19; // Atoms
      default:
        return 0;
    }
  }
}
