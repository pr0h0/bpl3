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

  assignmentOperators: TokenType[] = [
    TokenType.ASSIGN,
    TokenType.PLUS_ASSIGN,
    TokenType.MINUS_ASSIGN,
    TokenType.STAR_ASSIGN,
    TokenType.SLASH_ASSIGN,
    TokenType.PERCENT_ASSIGN,
    TokenType.CARET_ASSIGN,
    TokenType.AMPERSAND_ASSIGN,
    TokenType.PIPE_ASSIGN,
  ];

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit(
      "; Begin Binary Expression",
      "binary expression start - " + this.operator.value,
    );
    this.right.transpile(gen, scope);
    gen.emit("push rax", "save right operand");

    const isAssignmentOp = this.assignmentOperators.includes(
      this.operator.type,
    );

    if (isAssignmentOp) {
      scope.setCurrentContext({ type: "LHS" });
    }
    this.left.transpile(gen, scope);
    if (isAssignmentOp) {
      scope.removeCurrentContext("LHS");
    }

    gen.emit("pop rbx", "load right operand");
    switch (this.operator.type) {
      // Arithmetic Operators
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

      // Assignment Operators
      case TokenType.ASSIGN:
        if (this.left.type !== ExpressionType.IdentifierExpr) {
          throw new Error("Left operand of assignment must be an identifier.");
        }
        gen.emit("mov [rax], rbx", "assignment");
        break;
      case TokenType.PLUS_ASSIGN:
        gen.emit("add [rax], rbx", "plus assignment");
        break;
      case TokenType.MINUS_ASSIGN:
        gen.emit("sub [rax], rbx", "minus assignment");
        break;
      case TokenType.STAR_ASSIGN:
        gen.emit("mov rcx, [rax]", "load current value for times assignment");
        gen.emit("imul rcx, rbx", "times assignment");
        gen.emit("mov [rax], rcx", "store result back to variable");
        break;
      case TokenType.SLASH_ASSIGN:
        gen.emit("push rax", "save dividend address");
        gen.emit("xor rdx, rdx", "clear rdx for division");
        gen.emit("mov rdi, [rax]", "move dividend to rdi");
        gen.emit("mov rax, rbx", "move divisor to rax");
        gen.emit("div rdi", "division");
        gen.emit("mov rbx, rax", "move result to rbx");
        gen.emit("pop rax", "restore dividend address");
        gen.emit("mov [rax], rax", "store result back to variable");
        break;
      case TokenType.PERCENT_ASSIGN:
        gen.emit("push rax", "save dividend address");
        gen.emit("xor rdx, rdx", "clear rdx for division");
        gen.emit("mov rdi, [rax]", "move dividend to rdi");
        gen.emit("mov rax, rbx", "move divisor to rax");
        gen.emit("div rdi", "division");
        gen.emit("mov rbx, rdx", "move remainder to rbx");
        gen.emit("pop rax", "restore dividend address");
        gen.emit("mov [rax], rbx", "store remainder back to variable");
        break;
      case TokenType.CARET_ASSIGN:
        gen.emit("xor [rax], rbx", "bitwise XOR assignment");
        break;
      case TokenType.AMPERSAND_ASSIGN:
        gen.emit("and [rax], rbx", "bitwise AND assignment");
        break;
      case TokenType.PIPE_ASSIGN:
        gen.emit("or [rax], rbx", "bitwise OR assignment");
        break;

      // Comparison Operators
      case TokenType.EQUAL:
        gen.emit("cmp rax, rbx", "compare for equality");
        gen.emit("sete al", "set al if equal");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.NOT_EQUAL:
        gen.emit("cmp rax, rbx", "compare for inequality");
        gen.emit("setne al", "set al if not equal");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.LESS_THAN:
        gen.emit("cmp rax, rbx", "compare for less than");
        gen.emit("setl al", "set al if less than");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.LESS_EQUAL:
        gen.emit("cmp rax, rbx", "compare for less than or equal");
        gen.emit("setle al", "set al if less than or equal");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.GREATER_THAN:
        gen.emit("cmp rax, rbx", "compare for greater than");
        gen.emit("setg al", "set al if greater than");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.GREATER_EQUAL:
        gen.emit("cmp rax, rbx", "compare for greater than or equal");
        gen.emit("setge al", "set al if greater than or equal");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.AND: // &&
        gen.emit("cmp rax, 0", "compare left operand to 0");
        gen.emit("sete al", "set al if left operand is true");
        gen.emit("cmp rbx, 0", "compare right operand to 0");
        gen.emit("sete bl", "set bl if right operand is true");
        gen.emit("and al, bl", "logical AND");
        gen.emit("movzx rax, al", "zero extend al to rax");
        break;
      case TokenType.OR: // ||
        gen.emit("cmp rax, 0", "compare left operand to 0");
        gen.emit("sete al", "set al if left operand is true");
        gen.emit("cmp rbx, 0", "compare right operand to 0");
        gen.emit("sete bl", "set bl if right operand is true");
        gen.emit("or al, bl", "logical OR");
        gen.emit("movzx rax, al", "zero extend al to rax");
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
