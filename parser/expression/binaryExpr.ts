import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class BinaryExpr extends Expression {
  constructor(
    public left: Expression,
    public operator: Token,
    public right: Expression,
  ) {
    super(ExpressionType.BinaryExpression);
  }

  public toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += `[ Binary Expression: ${this.operator.value} ]\n`;
    output += this.left.toString(this.depth + 1);
    output += this.right.toString(this.depth + 1);
    output +=
      this.getDepth() + `/[ Binary Expression: ${this.operator.value} ]\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit(
      "; Begin Binary Expression",
      "binary expression start - " + this.operator.value,
    );
    this.right.transpile(gen, scope);
    gen.emit("push rax", "save right operand");
    this.left.transpile(gen, scope);
    gen.emit("pop rbx", "load right operand");
    switch (this.operator.type) {
      case TokenType.PLUS:
        gen.emit("add rax, rbx", "addition");
        break;
      case TokenType.MINUS:
        gen.emit("sub rax, rbx", "subtraction");
        break;
      case TokenType.STAR:
        gen.emit("imul rax, rbx", "multiplication");
        break;
      case TokenType.SLASH:
        gen.emit("xor rdx, rdx", "clear rdx for division");
        gen.emit("mov rdi, rax", "move dividend to rdi");
        gen.emit("mov rax, rbx", "move divisor to rax");
        gen.emit("div rdi", "division");
        break;
      case TokenType.PERCENT:
        gen.emit("xor rdx, rdx", "clear rdx for division");
        gen.emit("div rbx", "division");
        gen.emit("mov rax, rdx", "move remainder to rax");
        break;
      case TokenType.CARET:
        gen.emit("xor rax, rbx", "bitwise XOR");
        break;
      case TokenType.AMPERSAND:
        gen.emit("and rax, rbx", "bitwise AND");
        break;
      case TokenType.PIPE:
        gen.emit("or rax, rbx", "bitwise OR");
        break;
      case TokenType.BITSHIFT_LEFT:
        gen.emit("mov cl, bl", "move shift amount to cl");
        gen.emit("sal rax, cl", "bitwise left shift");
        break;
      case TokenType.BITSHIFT_RIGHT:
        gen.emit("mov cl, bl", "move shift amount to cl");
        gen.emit("sar rax, cl", "bitwise right shift");
        break;
      default:
        throw new Error(`Unsupported binary operator: ${this.operator.value}`);
    }
    gen.emit(
      "; End Binary Expression",
      "binary expression end - " + this.operator.value,
    );
  }
}
