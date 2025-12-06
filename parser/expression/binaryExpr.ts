import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import { getIntSize, resolveExpressionType } from "../../utils/typeResolver";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";

import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { IRType } from "../../transpiler/ir/IRType";
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

  private isFloatOperation(
    leftType: VariableType | null,
    rightType: VariableType | null,
  ): boolean {
    return (
      ((leftType?.name === "f64" || leftType?.name === "f32") &&
        !leftType?.isPointer &&
        !leftType?.isArray.length) ||
      ((rightType?.name === "f64" || rightType?.name === "f32") &&
        !rightType?.isPointer &&
        !rightType?.isArray.length) ||
      this.operator.type === TokenType.SLASH
    );
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    if (this.assignmentOperators.includes(this.operator.type)) {
      return this.handleAssignmentIR(gen, scope);
    }

    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    const leftVal = this.left.toIR(gen, scope);
    const rightVal = this.right.toIR(gen, scope);

    if (isLHS) scope.setCurrentContext({ type: "LHS" });

    const leftType = resolveExpressionType(this.left, scope);
    const rightType = resolveExpressionType(this.right, scope);

    const isFloat =
      leftType?.name === "f64" ||
      leftType?.name === "f32" ||
      rightType?.name === "f64" ||
      rightType?.name === "f32" ||
      this.operator.type === TokenType.SLASH;

    if (isFloat) {
      return this.toFloatIR(gen, leftVal, rightVal, leftType, rightType);
    } else {
      return this.toIntIR(gen, leftVal, rightVal, leftType, rightType, scope);
    }
  }

  private toIntIR(
    gen: IRGenerator,
    leftVal: string,
    rightVal: string,
    leftType: VariableType | null,
    rightType: VariableType | null,
    scope: Scope,
  ): string {
    if (
      this.operator.type === TokenType.PLUS ||
      this.operator.type === TokenType.MINUS
    ) {
      if (leftType?.isPointer && !rightType?.isPointer) {
        let idx = rightVal;
        if (rightType && getIntSize(rightType.name) < 8) {
          const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
          const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
          idx = gen.emitCast(
            opcode,
            idx,
            { type: "i64" },
            gen.getIRType(rightType),
          );
        }
        if (this.operator.type === TokenType.MINUS) {
          idx = gen.emitBinary(IROpcode.SUB, "i64", "0", idx);
        }
        const baseType = gen.getIRType({
          ...leftType,
          isPointer: leftType.isPointer - 1,
        });
        return gen.emitGEP(baseType, leftVal, [idx]);
      }
    }

    if (
      (leftType?.isPointer || leftVal === "null" || leftVal === "0") &&
      (rightType?.isPointer || rightVal === "null" || rightVal === "0")
    ) {
      if (
        this.operator.type === TokenType.EQUAL ||
        this.operator.type === TokenType.NOT_EQUAL
      ) {
        const opcode =
          this.operator.type === TokenType.EQUAL ? IROpcode.EQ : IROpcode.NE;
        let type: IRType = { type: "pointer", base: { type: "i8" } };
        if (leftVal !== "null" && leftVal !== "0" && leftType)
          type = gen.getIRType(leftType);
        else if (rightVal !== "null" && rightVal !== "0" && rightType)
          type = gen.getIRType(rightType);

        let l = leftVal;
        let r = rightVal;
        if (l === "0") l = "null";
        if (r === "0") r = "null";

        const result = gen.emitBinary(opcode, type, l, r);
        return gen.emitCast(
          IROpcode.ZEXT,
          result,
          { type: "i8" },
          { type: "i1" },
        );
      }
    }

    let lVal = leftVal;
    let rVal = rightVal;

    const leftSize = leftType ? getIntSize(leftType.name) : 8;
    const rightSize = rightType ? getIntSize(rightType.name) : 8;
    const maxSize = Math.max(leftSize, rightSize);

    let commonType: IRType = { type: "i64" };

    const isLogical = [
      TokenType.AND,
      TokenType.OR,
      TokenType.AMPERSAND,
      TokenType.PIPE,
      TokenType.CARET,
    ].includes(this.operator.type);
    if (isLogical && maxSize === 1) {
      commonType = { type: "i8" };
    } else if (maxSize <= 4) {
      commonType = { type: "i32" };
    }

    if (leftType) {
      const lType = gen.getIRType(leftType);
      if (lType.type !== commonType.type) {
        const isSigned = ["i8", "i16", "i32"].includes(leftType.name);
        const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
        lVal = gen.emitCast(opcode, lVal, commonType, lType);
      }
    }
    if (rightType) {
      const rType = gen.getIRType(rightType);
      if (rType.type !== commonType.type) {
        const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
        const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
        rVal = gen.emitCast(opcode, rVal, commonType, rType);
      }
    }

    let opcode: IROpcode;
    let isComparison = false;

    switch (this.operator.type) {
      case TokenType.PLUS:
        opcode = IROpcode.ADD;
        break;
      case TokenType.MINUS:
        opcode = IROpcode.SUB;
        break;
      case TokenType.STAR:
        opcode = IROpcode.MUL;
        break;
      case TokenType.SLASH_SLASH:
        opcode = IROpcode.DIV;
        break;
      case TokenType.PERCENT:
        opcode = IROpcode.MOD;
        break;
      case TokenType.AMPERSAND:
        opcode = IROpcode.AND;
        break;
      case TokenType.PIPE:
        opcode = IROpcode.OR;
        break;
      case TokenType.CARET:
        opcode = IROpcode.XOR;
        break;
      case TokenType.BITSHIFT_LEFT:
        opcode = IROpcode.SHL;
        break;
      case TokenType.BITSHIFT_RIGHT:
        opcode = IROpcode.SHR;
        break;
      case TokenType.EQUAL:
        opcode = IROpcode.EQ;
        isComparison = true;
        break;
      case TokenType.NOT_EQUAL:
        opcode = IROpcode.NE;
        isComparison = true;
        break;
      case TokenType.LESS_THAN:
        opcode = IROpcode.LT;
        isComparison = true;
        break;
      case TokenType.GREATER_THAN:
        opcode = IROpcode.GT;
        isComparison = true;
        break;
      case TokenType.LESS_EQUAL:
        opcode = IROpcode.LE;
        isComparison = true;
        break;
      case TokenType.GREATER_EQUAL:
        opcode = IROpcode.GE;
        isComparison = true;
        break;
      case TokenType.AND:
        opcode = IROpcode.AND;
        break;
      case TokenType.OR:
        opcode = IROpcode.OR;
        break;
      default:
        throw new Error(`Unknown int operator: ${this.operator.value}`);
    }

    const result = gen.emitBinary(opcode, commonType, lVal, rVal);

    if (isComparison) {
      return gen.emitCast(
        IROpcode.ZEXT,
        result,
        { type: "i8" },
        { type: "i1" },
      );
    }

    const resType = resolveExpressionType(this, scope);
    if (resType) {
      const resIRType = gen.getIRType(resType);
      if (resIRType.type !== commonType.type) {
        const isSigned = resType.name.startsWith("i");
        const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
        return gen.emitCast(opcode, result, resIRType, commonType);
      }
    }
    return result;
  }

  private toFloatIR(
    gen: IRGenerator,
    leftVal: string,
    rightVal: string,
    leftType: VariableType | null,
    rightType: VariableType | null,
  ): string {
    let lVal = leftVal;
    let rVal = rightVal;
    let commonType: IRType = { type: "f64" };

    // Determine common type
    if (leftType?.name === "f64" || rightType?.name === "f64") {
      commonType = { type: "f64" };
    } else if (leftType?.name === "f32" || rightType?.name === "f32") {
      commonType = { type: "f32" };
    } else if (this.operator.type === TokenType.SLASH) {
      // Division defaults to f64 unless operands are small
      const leftSize = leftType ? getIntSize(leftType.name) : 8;
      const rightSize = rightType ? getIntSize(rightType.name) : 8;
      if (leftSize <= 4 && rightSize <= 4) {
        commonType = { type: "f32" };
      } else {
        commonType = { type: "f64" };
      }
    }

    // Cast left operand
    if (leftType) {
      const lType = gen.getIRType(leftType);
      if (lType.type !== commonType.type) {
        if (lType.type === "f32" && commonType.type === "f64") {
          lVal = gen.emitCast(IROpcode.FP_EXT, lVal, commonType, lType);
        } else if (lType.type !== "f32" && lType.type !== "f64") {
          // Int to Float
          lVal = gen.emitCast(IROpcode.SI_TO_FP, lVal, commonType, lType);
        }
      }
    }

    // Cast right operand
    if (rightType) {
      const rType = gen.getIRType(rightType);
      if (rType.type !== commonType.type) {
        if (rType.type === "f32" && commonType.type === "f64") {
          rVal = gen.emitCast(IROpcode.FP_EXT, rVal, commonType, rType);
        } else if (rType.type !== "f32" && rType.type !== "f64") {
          // Int to Float
          rVal = gen.emitCast(IROpcode.SI_TO_FP, rVal, commonType, rType);
        }
      }
    }

    let opcode: IROpcode;
    let isComparison = false;

    switch (this.operator.type) {
      case TokenType.PLUS:
        opcode = IROpcode.FADD;
        break;
      case TokenType.MINUS:
        opcode = IROpcode.FSUB;
        break;
      case TokenType.STAR:
        opcode = IROpcode.FMUL;
        break;
      case TokenType.SLASH:
        opcode = IROpcode.FDIV;
        break;
      case TokenType.SLASH_SLASH: {
        const div = gen.emitBinary(IROpcode.FDIV, commonType, lVal, rVal);
        const floorFunc =
          commonType.type === "f32" ? "llvm.floor.f32" : "llvm.floor.f64";

        gen.ensureIntrinsic(
          floorFunc,
          [{ name: "x", type: commonType }],
          commonType,
        );

        const floorRes = gen.emitCall(
          floorFunc,
          [{ value: div, type: commonType }],
          commonType,
        );
        return floorRes!;
      }
      case TokenType.EQUAL:
        opcode = IROpcode.FOEQ;
        isComparison = true;
        break;
      case TokenType.NOT_EQUAL:
        opcode = IROpcode.FONE;
        isComparison = true;
        break;
      case TokenType.LESS_THAN:
        opcode = IROpcode.FOLT;
        isComparison = true;
        break;
      case TokenType.GREATER_THAN:
        opcode = IROpcode.FOGT;
        isComparison = true;
        break;
      case TokenType.LESS_EQUAL:
        opcode = IROpcode.FOLE;
        isComparison = true;
        break;
      case TokenType.GREATER_EQUAL:
        opcode = IROpcode.FOGE;
        isComparison = true;
        break;
      default:
        throw new Error(`Unsupported float operator: ${this.operator.value}`);
    }

    const result = gen.emitBinary(opcode, commonType, lVal, rVal);

    if (isComparison) {
      return gen.emitCast(
        IROpcode.ZEXT,
        result,
        { type: "i8" },
        { type: "i1" },
      );
    }

    return result;
  }

  handleAssignmentIR(gen: IRGenerator, scope: Scope): string {
    const ptr = this.left.getAddress(gen, scope);
    let val = this.right.toIR(gen, scope);
    let leftType = resolveExpressionType(this.left, scope);

    // Special case: if LHS is BinaryExpr (pointer arithmetic), we are assigning to the pointed value
    // e.g. (arr + i) = val  ->  *(arr + i) = val
    if (this.left instanceof BinaryExpr && leftType && leftType.isPointer > 0) {
      leftType = { ...leftType, isPointer: leftType.isPointer - 1 };
    }

    const type = gen.getIRType(leftType!);

    if (this.operator.type !== TokenType.ASSIGN) {
      const leftVal = gen.emitLoad(type, ptr);
      let opcode: IROpcode;
      const isFloat = type.type === "f32" || type.type === "f64";

      switch (this.operator.type) {
        case TokenType.PLUS_ASSIGN:
          opcode = isFloat ? IROpcode.FADD : IROpcode.ADD;
          break;
        case TokenType.MINUS_ASSIGN:
          opcode = isFloat ? IROpcode.FSUB : IROpcode.SUB;
          break;
        case TokenType.STAR_ASSIGN:
          opcode = isFloat ? IROpcode.FMUL : IROpcode.MUL;
          break;
        case TokenType.SLASH_ASSIGN:
          opcode = isFloat ? IROpcode.FDIV : IROpcode.DIV;
          break;
        case TokenType.PERCENT_ASSIGN:
          opcode = isFloat ? IROpcode.FMOD : IROpcode.MOD;
          break;
        case TokenType.AMPERSAND_ASSIGN:
          opcode = IROpcode.AND;
          break;
        case TokenType.PIPE_ASSIGN:
          opcode = IROpcode.OR;
          break;
        case TokenType.CARET_ASSIGN:
          opcode = IROpcode.XOR;
          break;
        default:
          throw new Error(
            `Unknown assignment operator: ${this.operator.value}`,
          );
      }
      val = gen.emitBinary(opcode, type, leftVal, val);
    } else {
      const rightType = resolveExpressionType(this.right, scope);
      if (rightType) {
        const rType = gen.getIRType(rightType);
        if (rType.type !== type.type) {
          if (
            (type.type === "f32" || type.type === "f64") &&
            rType.type !== "f32" &&
            rType.type !== "f64"
          ) {
            // Int to Float
            val = gen.emitCast(IROpcode.SI_TO_FP, val, type, rType);
          } else if (
            (rType.type === "f32" || rType.type === "f64") &&
            type.type !== "f32" &&
            type.type !== "f64"
          ) {
            // Float to Int
            val = gen.emitCast(IROpcode.FP_TO_SI, val, type, rType);
          } else if (type.type === "f64" && rType.type === "f32") {
            // f32 to f64
            val = gen.emitCast(IROpcode.FP_EXT, val, type, rType);
          } else if (type.type === "f32" && rType.type === "f64") {
            // f64 to f32
            val = gen.emitCast(IROpcode.FP_TRUNC, val, type, rType);
          } else if (type.type === "pointer" && rType.type !== "pointer") {
            // Int to Pointer
            val = gen.emitCast(IROpcode.INT_TO_PTR, val, type, rType);
          } else if (type.type !== "pointer" && rType.type === "pointer") {
            // Pointer to Int
            val = gen.emitCast(IROpcode.PTR_TO_INT, val, type, rType);
          } else {
            const isSigned = ["i8", "i16", "i32"].includes(rightType.name);
            const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
            if (getIntSize(rightType.name) > getIntSize(leftType!.name)) {
              val = gen.emitCast(IROpcode.TRUNC, val, type, rType);
            } else {
              val = gen.emitCast(opcode, val, type, rType);
            }
          }
        }
      }
    }

    gen.emitStore(type, val, ptr);
    return val;
  }

  getAddress(gen: IRGenerator, scope: Scope): string {
    // For pointer arithmetic on LHS (e.g. (ptr + offset) = val),
    // the expression evaluates to the address to store to.
    return this.toIR(gen, scope);
  }
}
