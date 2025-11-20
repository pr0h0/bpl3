import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class UnaryExpr extends Expression {
  constructor(
    public operator: Token,
    public right: Expression,
  ) {
    super(ExpressionType.UnaryExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();

    output += "[ Unary Expression ]\n";
    output += this.getDepth() + `Operator: ${this.operator}\n`;
    output += this.right.toString(this.depth + 1);
    output += this.getDepth() + `[/ Unary Expression ]\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    this.right.transpile(gen, scope);
    switch (this.operator.type) {
      case TokenType.MINUS:
        gen.emit("neg rax", "unary negation");
        break;
      case TokenType.PLUS:
        // Unary plus does nothing
        gen.emit("; unary plus - no operation");
        break;
      case TokenType.TILDE:
        gen.emit("not rax", "bitwise NOT");
        break;
      case TokenType.NOT:
        // Logical NOT
        gen.emit("cmp rax, 0", "compare with zero for logical NOT");
        gen.emit("sete al", "set al to 1 if zero, else 0");
        gen.emit("movzx rax, al", "zero-extend al to rax");
        break;
      // case TokenType.INCREMENT:
      //   gen.emit("inc rax", "pre-increment");
      //   break;
      // case TokenType.DECREMENT:
      //   gen.emit("dec rax", "pre-decrement");
      //   break;
      case TokenType.AMPERSAND:
        if (this.right.type == ExpressionType.IdentifierExpr) {
          gen.emit("lea rax, [rax]", "address-of operator");
        } else {
          throw new Error(
            `Address-of operator can only be applied to identifiers/variables.`,
          );
        }
        break;
      case TokenType.STAR:
        gen.emit("mov rax, [rax]", "dereference operator");
        break;
      default:
        throw new Error(`Unsupported unary operator: ${this.operator.value}`);
    }
  }
}
