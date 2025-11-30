import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
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

  optimize(): Expression {
    this.left = this.left.optimize();
    this.right = this.right.optimize();

    if (this.left instanceof NumberLiteralExpr) {
      const leftVal = Number(this.left.value);
      if (this.operator.type === TokenType.AND && leftVal === 0) {
        return new NumberLiteralExpr("0", this.operator);
      }
      if (this.operator.type === TokenType.OR && leftVal !== 0) {
        return new NumberLiteralExpr("1", this.operator);
      }
    }

    if (
      this.left instanceof NumberLiteralExpr &&
      this.right instanceof NumberLiteralExpr
    ) {
      const leftVal = Number(this.left.value);
      const rightVal = Number(this.right.value);
      let result: number | null = null;

      switch (this.operator.type) {
        case TokenType.PLUS:
          result = leftVal + rightVal;
          break;
        case TokenType.MINUS:
          result = leftVal - rightVal;
          break;
        case TokenType.STAR:
          result = leftVal * rightVal;
          break;
        case TokenType.SLASH:
          if (rightVal !== 0) result = leftVal / rightVal;
          break;
        case TokenType.SLASH_SLASH:
          if (rightVal !== 0) result = Math.floor(leftVal / rightVal);
          break;
        case TokenType.PERCENT:
          if (rightVal !== 0) result = leftVal % rightVal;
          break;
        case TokenType.CARET:
          result = leftVal ^ rightVal;
          break;
        case TokenType.AMPERSAND:
          result = leftVal & rightVal;
          break;
        case TokenType.PIPE:
          result = leftVal | rightVal;
          break;
        case TokenType.BITSHIFT_LEFT:
          result = leftVal << rightVal;
          break;
        case TokenType.BITSHIFT_RIGHT:
          result = leftVal >> rightVal;
          break;
        case TokenType.EQUAL:
          result = leftVal === rightVal ? 1 : 0;
          break;
        case TokenType.NOT_EQUAL:
          result = leftVal !== rightVal ? 1 : 0;
          break;
        case TokenType.LESS_THAN:
          result = leftVal < rightVal ? 1 : 0;
          break;
        case TokenType.GREATER_THAN:
          result = leftVal > rightVal ? 1 : 0;
          break;
        case TokenType.LESS_EQUAL:
          result = leftVal <= rightVal ? 1 : 0;
          break;
        case TokenType.GREATER_EQUAL:
          result = leftVal >= rightVal ? 1 : 0;
          break;
        case TokenType.AND:
          result = leftVal !== 0 && rightVal !== 0 ? 1 : 0;
          break;
        case TokenType.OR:
          result = leftVal !== 0 || rightVal !== 0 ? 1 : 0;
          break;
      }

      if (result !== null) {
        return new NumberLiteralExpr(result.toString(), this.operator); // Reusing operator token for location info if needed, though ideally should be a new token
      }
    }
    return this;
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
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    if (this.assignmentOperators.includes(this.operator.type)) {
      this.handleAssignment(gen, scope);
      return;
    }

    const leftType = this.resolveExpressionType(this.left, scope);
    const rightType = this.resolveExpressionType(this.right, scope);
    const isFloat =
      ((leftType?.name === "f64" || leftType?.name === "f32") &&
        !leftType?.isPointer &&
        !leftType?.isArray.length) ||
      ((rightType?.name === "f64" || rightType?.name === "f32") &&
        !rightType?.isPointer &&
        !rightType?.isArray.length) ||
      this.operator.type === TokenType.SLASH;

    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    this.right.transpile(gen, scope);
    gen.emit("push rax", "Push right operand");
    this.left.transpile(gen, scope);
    gen.emit("pop rbx", "Pop right operand into rbx");

    if (isLHS) scope.setCurrentContext({ type: "LHS" });

    // Pointer Arithmetic
    let scale = 1;
    if (
      !isFloat &&
      (this.operator.type === TokenType.PLUS ||
        this.operator.type === TokenType.MINUS)
    ) {
      if (
        leftType?.isPointer &&
        leftType.isPointer > 0 &&
        !rightType?.isPointer
      ) {
        // Pointer +/- Int
        if (leftType.isPointer > 1) {
          scale = 8;
        } else {
          const typeInfo = scope.resolveType(leftType.name);
          if (typeInfo) scale = typeInfo.size;
        }
        if (scale > 1) {
          gen.emit(`imul rbx, ${scale}`, `Scale index by ${scale}`);
        }
      } else if (
        rightType?.isPointer &&
        rightType.isPointer > 0 &&
        !leftType?.isPointer &&
        this.operator.type === TokenType.PLUS
      ) {
        // Int + Pointer
        if (rightType.isPointer > 1) {
          scale = 8;
        } else {
          const typeInfo = scope.resolveType(rightType.name);
          if (typeInfo) scale = typeInfo.size;
        }
        if (scale > 1) {
          gen.emit(`imul rax, ${scale}`, `Scale index by ${scale}`);
        }
      }
    }

    if (isFloat) {
      if (leftType?.name !== "f64" && leftType?.name !== "f32") {
        gen.emit("cvtsi2sd xmm0, rax", "Convert left int to float");
      } else if (leftType?.name === "f32") {
        gen.emit("movd xmm0, eax", "Move left f32 bits to xmm0");
        gen.emit("cvtss2sd xmm0, xmm0", "Convert left f32 to f64");
      } else {
        gen.emit("movq xmm0, rax", "Move left float bits to xmm0");
      }

      if (rightType?.name !== "f64" && rightType?.name !== "f32") {
        gen.emit("cvtsi2sd xmm1, rbx", "Convert right int to float");
      } else if (rightType?.name === "f32") {
        gen.emit("movd xmm1, ebx", "Move right f32 bits to xmm1");
        gen.emit("cvtss2sd xmm1, xmm1", "Convert right f32 to f64");
      } else {
        gen.emit("movq xmm1, rbx", "Move right float bits to xmm1");
      }

      switch (this.operator.type) {
        case TokenType.PLUS:
          gen.emit("addsd xmm0, xmm1", "Float Addition");
          break;
        case TokenType.MINUS:
          gen.emit("subsd xmm0, xmm1", "Float Subtraction");
          break;
        case TokenType.STAR:
          gen.emit("mulsd xmm0, xmm1", "Float Multiplication");
          break;
        case TokenType.SLASH:
          gen.emit("divsd xmm0, xmm1", "Float Division");
          break;
        case TokenType.SLASH_SLASH:
          gen.emit("divsd xmm0, xmm1", "Float Division");
          gen.emit("roundsd xmm0, xmm0, 1", "Floor (Round down)");
          break;
        case TokenType.EQUAL:
          gen.emit("ucomisd xmm0, xmm1", "Float Compare ==");
          gen.emit("setnp al", "Set al if not NaN");
          gen.emit("sete ah", "Set ah if equal");
          gen.emit("and al, ah", "Result = !NaN && Equal");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        case TokenType.NOT_EQUAL:
          gen.emit("ucomisd xmm0, xmm1", "Float Compare !=");
          gen.emit("setp al", "Set al if NaN");
          gen.emit("setne ah", "Set ah if not equal");
          gen.emit("or al, ah", "Result = NaN || NotEqual");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        case TokenType.GREATER_THAN:
          gen.emit("ucomisd xmm0, xmm1", "Float Compare >");
          gen.emit("seta al", "Set al if >");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        case TokenType.GREATER_EQUAL:
          gen.emit("ucomisd xmm0, xmm1", "Float Compare >=");
          gen.emit("setae al", "Set al if >=");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        case TokenType.LESS_THAN:
          gen.emit("ucomisd xmm1, xmm0", "Float Compare < (swapped >)");
          gen.emit("seta al", "Set al if <");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        case TokenType.LESS_EQUAL:
          gen.emit("ucomisd xmm1, xmm0", "Float Compare <= (swapped >=)");
          gen.emit("setae al", "Set al if <=");
          gen.emit("movzx rax, al", "Zero extend");
          return;
        default:
          throw new Error(
            `Operator ${this.operator.value} not supported for floating point numbers`,
          );
      }

      const resultType = this.resolveExpressionType(this, scope);
      if (resultType?.name === "f32") {
        gen.emit("cvtsd2ss xmm0, xmm0", "Convert result f64 to f32");
        gen.emit("movd eax, xmm0", "Move f32 bits to EAX");
      } else {
        gen.emit("movq rax, xmm0", "Move result back to RAX");
      }
      return;
    }

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
      case TokenType.SLASH_SLASH:
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

  private getIntSize(typeName: string): number {
    switch (typeName) {
      case "i8":
      case "u8":
      case "char":
      case "bool":
        return 1;
      case "i16":
      case "u16":
        return 2;
      case "i32":
      case "u32":
        return 4;
      case "i64":
      case "u64":
      case "int":
      case "usize":
        return 8;
      default:
        return 8;
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

      if (binExpr.operator.type === TokenType.SLASH) {
        const leftSize = leftType ? this.getIntSize(leftType.name) : 8;
        const rightSize = rightType ? this.getIntSize(rightType.name) : 8;

        if (leftType?.name === "f64" || rightType?.name === "f64")
          return { name: "f64", isPointer: 0, isArray: [] };
        if (leftType?.name === "f32" || rightType?.name === "f32")
          return { name: "f32", isPointer: 0, isArray: [] };

        if (leftSize <= 4 && rightSize <= 4)
          return { name: "f32", isPointer: 0, isArray: [] };
        return { name: "f64", isPointer: 0, isArray: [] };
      }

      if (binExpr.operator.type === TokenType.SLASH_SLASH) {
        if (leftType?.name === "f64" || rightType?.name === "f64")
          return { name: "f64", isPointer: 0, isArray: [] };
        if (leftType?.name === "f32" || rightType?.name === "f32")
          return { name: "f32", isPointer: 0, isArray: [] };
        return leftType || { name: "u64", isPointer: 0, isArray: [] };
      }

      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };

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
    } else if (expr.type === ExpressionType.NumberLiteralExpr) {
      const numExpr = expr as NumberLiteralExpr;
      if (numExpr.value.includes(".")) {
        return { name: "f64", isPointer: 0, isArray: [] };
      }
      return { name: "u64", isPointer: 0, isArray: [] };
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

    const leftType = this.resolveExpressionType(this.left, scope);
    const rightType = this.resolveExpressionType(this.right, scope);

    // Check for pointer arithmetic in assignment
    let scale = 1;
    if (
      leftType?.isPointer &&
      leftType.isPointer > 0 &&
      (this.operator.type === TokenType.PLUS_ASSIGN ||
        this.operator.type === TokenType.MINUS_ASSIGN)
    ) {
      if (leftType.isPointer > 1) {
        scale = 8;
      } else {
        const typeInfo = scope.resolveType(leftType.name);
        if (typeInfo) scale = typeInfo.size;
      }
    }

    const isFloat =
      ((leftType?.name === "f64" || leftType?.name === "f32") &&
        !leftType?.isPointer &&
        !leftType?.isArray.length) ||
      ((rightType?.name === "f64" || rightType?.name === "f32") &&
        !rightType?.isPointer &&
        !rightType?.isArray.length);

    if (isFloat) {
      // Ensure Right is in XMM1 (as f64)
      if (rightType?.name !== "f64" && rightType?.name !== "f32") {
        gen.emit("cvtsi2sd xmm1, rbx", "Convert right int to float");
      } else if (rightType?.name === "f32") {
        gen.emit("movd xmm1, ebx", "Move right f32 bits to xmm1");
        gen.emit("cvtss2sd xmm1, xmm1", "Convert right f32 to f64");
      } else {
        gen.emit("movq xmm1, rbx", "Move right float bits to xmm1");
      }

      // Load Left into XMM0 (as f64) if needed
      if (this.operator.type !== TokenType.ASSIGN) {
        if (leftType?.name === "f32") {
          gen.emit("movss xmm0, [rax]", "Load f32 from left");
          gen.emit("cvtss2sd xmm0, xmm0", "Convert f32 to f64");
        } else if (leftType?.name === "f64") {
          gen.emit("movsd xmm0, [rax]", "Load f64 from left");
        } else {
          // Left is int, load and convert
          const typeInfo = scope.resolveType(leftType!.name);
          if (typeInfo?.size === 1) {
            gen.emit("movzx rcx, byte [rax]", "Load 8-bit int");
          } else if (typeInfo?.size === 2) {
            gen.emit("movzx rcx, word [rax]", "Load 16-bit int");
          } else if (typeInfo?.size === 4) {
            gen.emit("movsxd rcx, dword [rax]", "Load 32-bit int");
          } else {
            gen.emit("mov rcx, [rax]", "Load 64-bit int");
          }
          gen.emit("cvtsi2sd xmm0, rcx", "Convert left int to float");
        }
      }

      switch (this.operator.type) {
        case TokenType.ASSIGN:
          gen.emit("movapd xmm0, xmm1", "Move right to result");
          break;
        case TokenType.PLUS_ASSIGN:
          gen.emit("addsd xmm0, xmm1", "Float Add Assign");
          break;
        case TokenType.MINUS_ASSIGN:
          gen.emit("subsd xmm0, xmm1", "Float Sub Assign");
          break;
        case TokenType.STAR_ASSIGN:
          gen.emit("mulsd xmm0, xmm1", "Float Mul Assign");
          break;
        case TokenType.SLASH_ASSIGN:
          gen.emit("divsd xmm0, xmm1", "Float Div Assign");
          break;
        default:
          throw new Error(
            `Unsupported float assignment operator: ${this.operator.value}`,
          );
      }

      // Store Result (XMM0) back to Left ([RAX])
      if (leftType?.name === "f32") {
        gen.emit("cvtsd2ss xmm0, xmm0", "Convert result f64 to f32");
        gen.emit("movss [rax], xmm0", "Store f32");
      } else if (leftType?.name === "f64") {
        gen.emit("movsd [rax], xmm0", "Store f64");
      } else {
        // Store into int
        gen.emit("cvttsd2si rbx, xmm0", "Convert result to int");
        const typeInfo = scope.resolveType(leftType!.name);
        if (typeInfo?.size === 1) gen.emit("mov [rax], bl");
        else if (typeInfo?.size === 2) gen.emit("mov [rax], bx");
        else if (typeInfo?.size === 4) gen.emit("mov [rax], ebx");
        else gen.emit("mov [rax], rbx");
      }
      return;
    }

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
        if (scale > 1) gen.emit(`imul rbx, ${scale}`, `Scale RHS by ${scale}`);
        gen.emit("add [rax], rbx", "Addition assignment");
        break;
      case TokenType.MINUS_ASSIGN:
        if (scale > 1) gen.emit(`imul rbx, ${scale}`, `Scale RHS by ${scale}`);
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
