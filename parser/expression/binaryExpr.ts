import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

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
    if (this.assignmentOperators.includes(this.operator.type)) {
      this.handleAssignment(gen, scope);
      return;
    }

    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    this.right.transpile(gen, scope);
    gen.emit("push rax", "Push right operand");
    this.left.transpile(gen, scope);
    gen.emit("pop rbx", "Pop right operand into rbx");

    if (isLHS) scope.setCurrentContext({ type: "LHS" });

    switch (this.operator.type) {
      // Arithmetic Operators
      case TokenType.PLUS:
        gen.emit("add rax, rbx", "Addition");
        break;
      case TokenType.MINUS:
        gen.emit("sub rax, rbx", "Subtraction");
        break;
      case TokenType.STAR:
        gen.emit("imul rax, rbx", "Multiplication");
        break;
      case TokenType.SLASH:
        gen.emit(
          "cqo",
          "Sign-extend RAX into RDX:RAX for 128-bit signed dividend",
        );
        gen.emit(
          "idiv rbx",
          "Signed division (RDX:RAX / RBX). Quotient remains in RAX.",
        );
        break;
      case TokenType.PERCENT:
        gen.emit(
          "cqo",
          "Sign-extend RAX into RDX:RAX for 128-bit signed dividend",
        );
        gen.emit(
          "idiv rbx",
          "Signed division (RDX:RAX / RBX). Remainder is in RDX.",
        );
        gen.emit("mov rax, rdx", "Move remainder (RDX) to result register RAX");
        break;
      case TokenType.CARET:
        gen.emit("xor rax, rbx", "Bitwise XOR");
        break;
      case TokenType.AMPERSAND:
        gen.emit("and rax, rbx", "Bitwise AND");
        break;
      case TokenType.PIPE:
        gen.emit("or rax, rbx", "Bitwise OR");
        break;

      // Logical Operators
      case TokenType.BITSHIFT_LEFT:
        gen.emit("mov cl, bl", "Move shift amount to cl");
        gen.emit("shl rax, cl", "Bitwise Left Shift");
        break;
      case TokenType.BITSHIFT_RIGHT:
        gen.emit("mov cl, bl", "Move shift amount to cl");
        gen.emit("shr rax, cl", "Bitwise Right Shift");
        break;

      // Comparison Operators
      case TokenType.EQUAL:
        gen.emit("cmp rax, rbx", "Compare for equality");
        gen.emit("sete al", "Set al if equal");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.NOT_EQUAL:
        gen.emit("cmp rax, rbx", "Compare for inequality");
        gen.emit("setne al", "Set al if not equal");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.LESS_THAN:
        gen.emit("cmp rax, rbx", "Compare for less than");
        gen.emit("setl al", "Set al if less than");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.GREATER_THAN:
        gen.emit("cmp rax, rbx", "Compare for greater than");
        gen.emit("setg al", "Set al if greater than");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.LESS_EQUAL:
        gen.emit("cmp rax, rbx", "Compare for less than or equal");
        gen.emit("setle al", "Set al if less than or equal");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.GREATER_EQUAL:
        gen.emit("cmp rax, rbx", "Compare for greater than or equal");
        gen.emit("setge al", "Set al if greater than or equal");
        gen.emit("movzx rax, al", "Zero extend al to rax");
        break;
      case TokenType.AND: // &&
        const andLabel = gen.generateLabel("cmp_and_");
        gen.emit("cmp rax, 0", "Compare left operand to 0");
        gen.emit(`je ${andLabel}_false`, "Short-circuit if left is 0");
        gen.emit("cmp rbx, 0", "Compare right operand to 0");
        gen.emit(`jne ${andLabel}_true`, "Shift-circuit if right is not 0");
        gen.emitLabel(`${andLabel}_false`);
        gen.emit("xor rax, rax", "Result is false (0)");
        gen.emit(`jmp ${andLabel}_end`, "Jump to end");
        gen.emitLabel(`${andLabel}_true`);
        gen.emit("mov rax, 1", "Result is true (1)");
        gen.emitLabel(`${andLabel}_end`);
        break;
      case TokenType.OR: // ||
        const orLabel = gen.generateLabel("cmp_or_");
        gen.emit("cmp rax, 0", "Compare left operand to 0");
        gen.emit(`jne ${orLabel}_true`, "Short-circuit if left is not 0");
        gen.emit("cmp rbx, 0", "Compare right operand to 0");
        gen.emit(`je ${orLabel}_false`, "Short-circuit if right is 0");
        gen.emitLabel(`${orLabel}_true`);
        gen.emit("mov rax, 1", "Result is true (1)");
        gen.emit(`jmp ${orLabel}_end`, "Jump to end");
        gen.emitLabel(`${orLabel}_false`);
        gen.emit("xor rax, rax", "Result is false (0)");
        gen.emitLabel(`${orLabel}_end`);
        break;
    }
  }

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr.type === ExpressionType.IdentifierExpr) {
      const ident = expr as any;
      const resolved = scope.resolve(ident.name);
      return resolved ? resolved.varType : null;
    } else if (expr.type === ExpressionType.MemberAccessExpression) {
      const memberExpr = expr as any;
      const objectType = this.resolveExpressionType(memberExpr.object, scope);
      if (!objectType) return null;

      if (memberExpr.isIndexAccess) {
        if (objectType.isArray.length > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer,
            isArray: objectType.isArray.slice(1),
          };
        } else if (objectType.isPointer > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer - 1,
            isArray: [],
          };
        }
        return null;
      } else {
        const typeInfo = scope.resolveType(objectType.name);
        if (!typeInfo) return null;

        const propertyName = (memberExpr.property as any).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    } else if (expr.type === ExpressionType.BinaryExpression) {
      const binExpr = expr as any;
      const leftType = this.resolveExpressionType(binExpr.left, scope);
      const rightType = this.resolveExpressionType(binExpr.right, scope);

      if (leftType && leftType.isPointer > 0) return leftType;
      if (rightType && rightType.isPointer > 0) return rightType;
      return null;
    } else if (expr.type === ExpressionType.UnaryExpression) {
      const unaryExpr = expr as any;
      if (unaryExpr.operator.value === "*") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (unaryExpr.operator.value === "&") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      return null;
    }
    return null;
  }

  private emitStructCopy(gen: AsmGenerator, size: number) {
    gen.emit("push rsi", "Save rsi");
    gen.emit("push rdi", "Save rdi");
    gen.emit("push rcx", "Save rcx");

    gen.emit("mov rsi, rbx", "Source address");
    gen.emit("mov rdi, rax", "Destination address");
    gen.emit(`mov rcx, ${size}`, "Size to copy");
    gen.emit("rep movsb", "Copy bytes");

    gen.emit("pop rcx", "Restore rcx");
    gen.emit("pop rdi", "Restore rdi");
    gen.emit("pop rsi", "Restore rsi");
  }

  handleAssignment(gen: AsmGenerator, scope: Scope): void {
    this.right.transpile(gen, scope); // Evaluate right-hand side
    gen.emit("push rax", "Push right-hand side value onto stack");
    scope.stackOffset += 8;

    scope.setCurrentContext({ type: "LHS" });
    this.left.transpile(gen, scope); // Evaluate left-hand side (address)
    scope.removeCurrentContext("LHS");

    gen.emit("pop rbx", "Pop right-hand side value into rbx");
    scope.stackOffset -= 8;

    switch (this.operator.type) {
      case TokenType.ASSIGN:
        const leftType = this.resolveExpressionType(this.left, scope);
        if (leftType && !leftType.isPointer && !leftType.isArray.length) {
          const typeInfo = scope.resolveType(leftType.name);
          if (typeInfo && !typeInfo.isPrimitive) {
            this.emitStructCopy(gen, typeInfo.size);
            break;
          }
          // Primitive assignment - check size
          if (typeInfo) {
            if (typeInfo.size === 1) {
              gen.emit("mov [rax], bl", "Simple assignment (8-bit)");
              break;
            } else if (typeInfo.size === 2) {
              gen.emit("mov [rax], bx", "Simple assignment (16-bit)");
              break;
            } else if (typeInfo.size === 4) {
              gen.emit("mov [rax], ebx", "Simple assignment (32-bit)");
              break;
            }
          }
        }
        gen.emit("mov [rax], rbx", "Simple assignment");
        break;
      case TokenType.PLUS_ASSIGN:
        gen.emit("add [rax], rbx", "Addition assignment");
        break;
      case TokenType.MINUS_ASSIGN:
        gen.emit("sub [rax], rbx", "Subtraction assignment");
        break;
      case TokenType.STAR_ASSIGN:
        gen.emit("mov rcx, [rax]", "Load value from address");
        gen.emit("imul rcx, rbx", "Multiplication");
        gen.emit("mov [rax], rcx", "Store result back");
        break;
      case TokenType.SLASH_ASSIGN:
        gen.emit("push rax", "Save address");
        gen.emit("mov rax, [rax]", "Load value");
        gen.emit("cqo", "Sign-extend RAX into RDX:RAX");
        gen.emit("idiv rbx", "Signed division");
        gen.emit("pop rdi", "Restore address");
        gen.emit("mov [rdi], rax", "Division assignment");
        break;
      case TokenType.PERCENT_ASSIGN:
        gen.emit("push rax", "Save address");
        gen.emit("mov rax, [rax]", "Load value");
        gen.emit("cqo", "Sign-extend RAX into RDX:RAX");
        gen.emit("idiv rbx", "Signed division");
        gen.emit("pop rdi", "Restore address");
        gen.emit("mov [rdi], rdx", "Modulo assignment");
        break;
      case TokenType.CARET_ASSIGN:
        gen.emit("xor [rax], rbx", "Bitwise XOR assignment");
        break;
      case TokenType.AMPERSAND_ASSIGN:
        gen.emit("and [rax], rbx", "Bitwise AND assignment");
        break;
      case TokenType.PIPE_ASSIGN:
        gen.emit("or [rax], rbx", "Bitwise OR assignment");
        break;
      default:
        throw new Error(
          `Unsupported assignment operator: ${this.operator.value}`,
        );
    }
  }
}
