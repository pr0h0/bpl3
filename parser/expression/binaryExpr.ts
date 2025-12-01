import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
import type { VariableType } from "./variableDeclarationExpr";
import { resolveExpressionType, getIntSize } from "../../utils/typeResolver";

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

    const leftType = resolveExpressionType(this.left, scope);
    const rightType = resolveExpressionType(this.right, scope);
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

      const resultType = resolveExpressionType(this, scope);
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

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    if (this.assignmentOperators.includes(this.operator.type)) {
      return this.generateAssignmentIR(gen, scope);
    }

    // Clear LHS context for operands (they are R-values)
    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    const leftVal = this.left.generateIR(gen, scope);
    const rightVal = this.right.generateIR(gen, scope);

    if (isLHS) scope.setCurrentContext({ type: "LHS" });

    const leftType = resolveExpressionType(this.left, scope);
    const rightType = resolveExpressionType(this.right, scope);

    const isFloat =
      leftType?.name === "f64" ||
      leftType?.name === "f32" ||
      rightType?.name === "f64" ||
      rightType?.name === "f32" ||
      this.operator.type === TokenType.SLASH;

    const resultReg = gen.generateReg("binop");

    if (isFloat) {
      let lVal = leftVal;
      let rVal = rightVal;
      let opType = "double";

      if (leftType?.name === "f64" || rightType?.name === "f64") {
        opType = "double";
      } else if (this.operator.type === TokenType.SLASH) {
        // Division defaults to f64 unless operands are small
        const leftSize = leftType ? getIntSize(leftType.name) : 8;
        const rightSize = rightType ? getIntSize(rightType.name) : 8;
        if (leftSize <= 4 && rightSize <= 4) {
          opType = "float";
        } else {
          opType = "double";
        }
      } else {
        opType = "float";
      }

      if (opType === "float") {
        // Ensure both are float
        if (leftType?.name !== "f32") {
          // Int to float
          const conv = gen.generateReg("conv");
          gen.emit(`${conv} = sitofp i64 ${lVal} to float`);
          lVal = conv;
        }
        if (rightType?.name !== "f32") {
          // Int to float
          const conv = gen.generateReg("conv");
          gen.emit(`${conv} = sitofp i64 ${rVal} to float`);
          rVal = conv;
        }
      } else {
        // Promote to double
        if (leftType?.name === "f32") {
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = fpext float ${lVal} to double`);
          lVal = ext;
        } else if (leftType?.name !== "f64") {
          // Int to double
          const conv = gen.generateReg("conv");
          gen.emit(`${conv} = sitofp i64 ${lVal} to double`); // Assuming i64
          lVal = conv;
        }

        if (rightType?.name === "f32") {
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = fpext float ${rVal} to double`);
          rVal = ext;
        } else if (rightType?.name !== "f64") {
          // Int to double
          const conv = gen.generateReg("conv");
          gen.emit(`${conv} = sitofp i64 ${rVal} to double`);
          rVal = conv;
        }
      }

      if (this.operator.type === TokenType.SLASH_SLASH) {
        const divReg = gen.generateReg("div");
        gen.emit(`${divReg} = fdiv ${opType} ${lVal}, ${rVal}`);
        const floorReg = gen.generateReg("floor");
        const floorFunc =
          opType === "float" ? "@llvm.floor.f32" : "@llvm.floor.f64";
        gen.emitGlobal(
          `declare ${opType} ${floorFunc}(${opType}) memory(none)`,
        );
        gen.emit(
          `${floorReg} = call ${opType} ${floorFunc}(${opType} ${divReg})`,
        );
        return floorReg;
      }

      const op = this.getFloatOp(this.operator.type);
      // Assuming double for now
      if (
        ["fcmp", "fadd", "fsub", "fmul", "fdiv"].some((o) => op.startsWith(o))
      ) {
        if (op.startsWith("fcmp")) {
          gen.emit(`${resultReg} = ${op} ${opType} ${lVal}, ${rVal}`);
          // fcmp returns i1, we might need to zext to i8 if used as value?
          // But usually conditions consume i1.
          // If used as value (e.g. x = a == b), we need zext.
          const zext = gen.generateReg("zext");
          gen.emit(`${zext} = zext i1 ${resultReg} to i8`);
          return zext;
        }
        gen.emit(`${resultReg} = ${op} ${opType} ${lVal}, ${rVal}`);
      }
    } else {
      // Check for pointer comparison
      if (
        leftType?.isPointer ||
        rightType?.isPointer ||
        leftVal === "null" ||
        rightVal === "null"
      ) {
        if (
          this.operator.type === TokenType.EQUAL ||
          this.operator.type === TokenType.NOT_EQUAL
        ) {
          const pred = this.operator.type === TokenType.EQUAL ? "eq" : "ne";
          let l = leftVal;
          let r = rightVal;
          if (l === "0") l = "null";
          if (r === "0") r = "null";
          gen.emit(`${resultReg} = icmp ${pred} ptr ${l}, ${r}`);
          const zext = gen.generateReg("zext");
          gen.emit(`${zext} = zext i1 ${resultReg} to i8`);
          return zext;
        }
      }

      // Check for pointer arithmetic
      if (
        this.operator.type === TokenType.PLUS ||
        this.operator.type === TokenType.MINUS
      ) {
        if (leftType?.isPointer && !rightType?.isPointer) {
          // ptr + int
          const ptr = leftVal;
          let idx = rightVal;

          // Ensure idx is i64
          if (rightType && getIntSize(rightType.name) < 8) {
            const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
            const castOp = isSigned ? "sext" : "zext";
            const srcType = gen.mapType(rightType);
            const ext = gen.generateReg("ext");
            gen.emit(`${ext} = ${castOp} ${srcType} ${idx} to i64`);
            idx = ext;
          }

          const pointedType = {
            ...leftType,
            isPointer: leftType.isPointer - 1,
          };
          const llvmPointedType = gen.mapType(pointedType);

          if (this.operator.type === TokenType.MINUS) {
            const negIdx = gen.generateReg("neg_idx");
            gen.emit(`${negIdx} = sub i64 0, ${idx}`);
            gen.emit(
              `${resultReg} = getelementptr ${llvmPointedType}, ptr ${ptr}, i64 ${negIdx}`,
            );
          } else {
            gen.emit(
              `${resultReg} = getelementptr ${llvmPointedType}, ptr ${ptr}, i64 ${idx}`,
            );
          }
          return resultReg;
        }
      }

      // Promote operands to i64 if needed
      let lVal = leftVal;
      let rVal = rightVal;
      let opType = "i64";

      const isLogical = [
        TokenType.AND,
        TokenType.OR,
        TokenType.AMPERSAND,
        TokenType.PIPE,
        TokenType.CARET,
      ].includes(this.operator.type);

      if (
        isLogical &&
        leftType &&
        rightType &&
        getIntSize(leftType.name) === 1 &&
        getIntSize(rightType.name) === 1 &&
        !leftType.isPointer &&
        !rightType.isPointer
      ) {
        opType = "i8";
      } else {
        if (leftType && getIntSize(leftType.name) < 8 && !leftType.isPointer) {
          const isSigned = ["i8", "i16", "i32"].includes(leftType.name);
          const castOp = isSigned ? "sext" : "zext";
          const srcType = gen.mapType(leftType);
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = ${castOp} ${srcType} ${lVal} to i64`);
          lVal = ext;
        }

        if (
          rightType &&
          getIntSize(rightType.name) < 8 &&
          !rightType.isPointer
        ) {
          const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
          const castOp = isSigned ? "sext" : "zext";
          const srcType = gen.mapType(rightType);
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = ${castOp} ${srcType} ${rVal} to i64`);
          rVal = ext;
        }
      }

      const op = this.getIntOp(this.operator.type);

      if (op.startsWith("icmp")) {
        gen.emit(`${resultReg} = ${op} i64 ${lVal}, ${rVal}`);
        const zext = gen.generateReg("zext");
        gen.emit(`${zext} = zext i1 ${resultReg} to i8`);
        return zext;
      }

      gen.emit(`${resultReg} = ${op} ${opType} ${lVal}, ${rVal}`);
    }

    return resultReg;
  }

  private generateAssignmentIR(gen: LlvmGenerator, scope: Scope): string {
    let ptr = "";
    if (this.left.type === ExpressionType.IdentifierExpr) {
      const ident = this.left as any; // IdentifierExpr
      const info = scope.resolve(ident.name);
      if (info && info.llvmName) {
        ptr = info.llvmName;
      } else {
        throw new Error(`Variable ${ident.name} not found or no LLVM info`);
      }
    } else if (this.left.type === ExpressionType.MemberAccessExpression) {
      // MemberAccessExpr generateIR returns pointer if LHS context is set
      scope.setCurrentContext({ type: "LHS" });
      ptr = this.left.generateIR(gen, scope);
      scope.removeCurrentContext("LHS");
    } else {
      // Assume LHS evaluates to a pointer (address)
      // e.g. (ptr + offset) = val
      // For UnaryExpr (dereference), we need to set LHS context to get address instead of value
      scope.setCurrentContext({ type: "LHS" });
      ptr = this.left.generateIR(gen, scope);
      scope.removeCurrentContext("LHS");
    }

    const rightVal = this.right.generateIR(gen, scope);

    if (this.operator.type === TokenType.ASSIGN) {
      let leftType = resolveExpressionType(this.left, scope);
      if (!leftType) throw new Error("Cannot resolve LHS type");

      if (
        this.left.type !== ExpressionType.IdentifierExpr &&
        this.left.type !== ExpressionType.MemberAccessExpression
      ) {
        if (leftType.isPointer > 0) {
          leftType = { ...leftType, isPointer: leftType.isPointer - 1 };
        }
      }

      const llvmType = gen.mapType(leftType);
      let valToStore = rightVal;
      const rightType = resolveExpressionType(this.right, scope);

      // Determine if rightVal is i64 (promoted) or native size
      let rightIsI64 = false;
      if (
        (this.right.type === ExpressionType.BinaryExpression ||
          this.right.type === ExpressionType.NumberLiteralExpr) &&
        (!rightType ||
          (rightType.isPointer === 0 && rightType.isArray.length === 0))
      ) {
        const isFloat =
          rightType?.name === "f64" ||
          rightType?.name === "f32" ||
          (this.right as any).operator?.type === TokenType.SLASH; // BinaryExpr might be float div
        if (!isFloat) rightIsI64 = true;
      }

      if (rightIsI64) {
        if (leftType.isPointer > 0) {
          const inttoptr = gen.generateReg("inttoptr");
          gen.emit(`${inttoptr} = inttoptr i64 ${valToStore} to ptr`);
          valToStore = inttoptr;
        } else if (getIntSize(leftType.name) < 8 && !leftType.isPointer) {
          const trunc = gen.generateReg("trunc");
          gen.emit(`${trunc} = trunc i64 ${valToStore} to ${llvmType}`);
          valToStore = trunc;
        }
      } else if (rightType) {
        // Right is native size. Check for mismatch.
        const rightSize = getIntSize(rightType.name);
        const leftSize = getIntSize(leftType.name);
        const rightLLVMType = gen.mapType(rightType);

        if (leftType.name === "f64" && rightType.name === "f32") {
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = fpext float ${valToStore} to double`);
          valToStore = ext;
        } else if (leftType.name === "f32" && rightType.name === "f64") {
          const trunc = gen.generateReg("trunc");
          gen.emit(`${trunc} = fptrunc double ${valToStore} to float`);
          valToStore = trunc;
        } else if (
          rightSize > leftSize &&
          !leftType.isPointer &&
          !rightType.isPointer
        ) {
          const trunc = gen.generateReg("trunc");
          gen.emit(
            `${trunc} = trunc ${rightLLVMType} ${valToStore} to ${llvmType}`,
          );
          valToStore = trunc;
        } else if (
          rightSize < leftSize &&
          !leftType.isPointer &&
          !rightType.isPointer
        ) {
          const ext = gen.generateReg("ext");
          const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
          const op = isSigned ? "sext" : "zext";
          gen.emit(
            `${ext} = ${op} ${rightLLVMType} ${valToStore} to ${llvmType}`,
          );
          valToStore = ext;
        }
      }

      gen.emit(`store ${llvmType} ${valToStore}, ptr ${ptr}`);
    } else {
      // Compound assignment: load, op, store
      const leftType = resolveExpressionType(this.left, scope);
      if (!leftType) throw new Error("Cannot resolve LHS type");
      const llvmType = gen.mapType(leftType);

      const tmp = gen.generateReg("load");
      gen.emit(`${tmp} = load ${llvmType}, ptr ${ptr}`);

      const isFloat = leftType.name === "f64" || leftType.name === "f32";
      let op = "";
      let rVal = rightVal;

      if (isFloat) {
        op = this.getFloatOp(this.operator.type);
        // Convert RHS if needed
        const rightType = resolveExpressionType(this.right, scope);
        if (rightType?.name !== "f64" && rightType?.name !== "f32") {
          const conv = gen.generateReg("conv");
          gen.emit(`${conv} = sitofp i64 ${rVal} to ${llvmType}`);
          rVal = conv;
        } else if (rightType.name !== leftType.name) {
          // Convert float types
          const conv = gen.generateReg("conv");
          if (leftType.name === "f64") {
            gen.emit(`${conv} = fpext float ${rVal} to double`);
          } else {
            gen.emit(`${conv} = fptrunc double ${rVal} to float`);
          }
          rVal = conv;
        }
        const res = gen.generateReg("res");
        gen.emit(`${res} = ${op} ${llvmType} ${tmp}, ${rVal}`);
        gen.emit(`store ${llvmType} ${res}, ptr ${ptr}`);
      } else {
        op = this.getIntOp(this.operator.type);

        let lhsVal = tmp;
        if (getIntSize(leftType.name) < 8 && !leftType.isPointer) {
          const isSigned = ["i8", "i16", "i32"].includes(leftType.name);
          const castOp = isSigned ? "sext" : "zext";
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = ${castOp} ${llvmType} ${lhsVal} to i64`);
          lhsVal = ext;
        }

        const rightType = resolveExpressionType(this.right, scope);
        if (
          rightType &&
          getIntSize(rightType.name) < 8 &&
          !rightType.isPointer
        ) {
          const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
          const castOp = isSigned ? "sext" : "zext";
          const srcType = gen.mapType(rightType);
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = ${castOp} ${srcType} ${rVal} to i64`);
          rVal = ext;
        }

        const res = gen.generateReg("res");
        gen.emit(`${res} = ${op} i64 ${lhsVal}, ${rVal}`);

        let finalRes = res;
        if (getIntSize(leftType.name) < 8 && !leftType.isPointer) {
          const trunc = gen.generateReg("trunc");
          gen.emit(`${trunc} = trunc i64 ${res} to ${llvmType}`);
          finalRes = trunc;
        }
        gen.emit(`store ${llvmType} ${finalRes}, ptr ${ptr}`);
      }
    }

    return rightVal; // Return the assigned value
  }

  private getIntOp(type: TokenType): string {
    switch (type) {
      case TokenType.PLUS:
        return "add";
      case TokenType.MINUS:
        return "sub";
      case TokenType.STAR:
        return "mul";
      case TokenType.SLASH:
        return "sdiv";
      case TokenType.SLASH_SLASH:
        return "sdiv";
      case TokenType.PERCENT:
        return "srem";
      case TokenType.PLUS_ASSIGN:
        return "add";
      case TokenType.MINUS_ASSIGN:
        return "sub";
      case TokenType.STAR_ASSIGN:
        return "mul";
      case TokenType.SLASH_ASSIGN:
        return "sdiv";
      case TokenType.PERCENT_ASSIGN:
        return "srem";
      case TokenType.CARET_ASSIGN:
        return "xor";
      case TokenType.AMPERSAND_ASSIGN:
        return "and";
      case TokenType.PIPE_ASSIGN:
        return "or";
      case TokenType.EQUAL:
        return "icmp eq";
      case TokenType.NOT_EQUAL:
        return "icmp ne";
      case TokenType.LESS_THAN:
        return "icmp slt";
      case TokenType.GREATER_THAN:
        return "icmp sgt";
      case TokenType.LESS_EQUAL:
        return "icmp sle";
      case TokenType.GREATER_EQUAL:
        return "icmp sge";
      case TokenType.AND:
        return "and";
      case TokenType.OR:
        return "or";
      case TokenType.CARET:
        return "xor";
      case TokenType.AMPERSAND:
        return "and";
      case TokenType.PIPE:
        return "or";
      case TokenType.BITSHIFT_LEFT:
        return "shl";
      case TokenType.BITSHIFT_RIGHT:
        return "ashr"; // Arithmetic shift right (signed)
      default:
        throw new Error(`Unsupported int operator: ${type}`);
    }
  }

  private getFloatOp(type: TokenType): string {
    switch (type) {
      case TokenType.PLUS:
      case TokenType.PLUS_ASSIGN:
        return "fadd";
      case TokenType.MINUS:
      case TokenType.MINUS_ASSIGN:
        return "fsub";
      case TokenType.STAR:
      case TokenType.STAR_ASSIGN:
        return "fmul";
      case TokenType.SLASH:
      case TokenType.SLASH_ASSIGN:
        return "fdiv";
      case TokenType.EQUAL:
        return "fcmp oeq";
      case TokenType.NOT_EQUAL:
        return "fcmp one";
      case TokenType.LESS_THAN:
        return "fcmp olt";
      case TokenType.GREATER_THAN:
        return "fcmp ogt";
      case TokenType.LESS_EQUAL:
        return "fcmp ole";
      case TokenType.GREATER_EQUAL:
        return "fcmp oge";
      default:
        throw new Error(`Unsupported float operator: ${type}`);
    }
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

    const leftType = resolveExpressionType(this.left, scope);
    const rightType = resolveExpressionType(this.right, scope);

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
        gen.emit("movd eax, xmm0", "Move f32 bits to RAX");
      } else if (leftType?.name === "f64") {
        gen.emit("movsd [rax], xmm0", "Store f64");
        gen.emit("movq rax, xmm0", "Move f64 result to RAX");
      } else {
        // Store into int
        gen.emit("cvttsd2si rbx, xmm0", "Convert result to int");
        const typeInfo = scope.resolveType(leftType!.name);
        if (typeInfo?.size === 1) gen.emit("mov [rax], bl");
        else if (typeInfo?.size === 2) gen.emit("mov [rax], bx");
        else if (typeInfo?.size === 4) gen.emit("mov [rax], ebx");
        else gen.emit("mov [rax], rbx");
        gen.emit("mov rax, rbx", "Move int result to RAX");
      }
      return;
    }

    switch (this.operator.type) {
      case TokenType.ASSIGN:
        const leftType = resolveExpressionType(this.left, scope);
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
