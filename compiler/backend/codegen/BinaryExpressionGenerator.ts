/**
 * BinaryExpressionGenerator - Handles binary operations, comparisons, logical operators
 * Part of the ExpressionGenerator inheritance chain
 */
import * as AST from "../../common/AST";
import { TokenType } from "../../frontend/TokenType";
import { AddressExpressionGenerator } from "./AddressExpressionGenerator";
import { isEnumType } from "./utils";

export abstract class BinaryExpressionGenerator extends AddressExpressionGenerator {
  /**
   * Generate logical AND with short-circuit evaluation
   */
  protected generateLogicalAnd(expr: AST.BinaryExpr): string {
    const leftVal = this.generateExpression(expr.left);
    const resPtr = this.allocateStack(`and_res_${this.labelCount++}`, "i1");
    const falseLabel = this.newLabel("and.false");
    const trueLabel = this.newLabel("and.true");
    const endLabel = this.newLabel("and.end");

    this.emit(`  br i1 ${leftVal}, label %${trueLabel}, label %${falseLabel}`);

    this.emit(`${falseLabel}:`);
    this.emit(`  store i1 0, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${trueLabel}:`);
    const rightVal = this.generateExpression(expr.right);
    this.emit(`  store i1 ${rightVal}, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${endLabel}:`);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load i1, i1* ${resPtr}`);
    return reg;
  }

  /**
   * Generate logical OR with short-circuit evaluation
   */
  protected generateLogicalOr(expr: AST.BinaryExpr): string {
    const leftVal = this.generateExpression(expr.left);
    const resPtr = this.allocateStack(`or_res_${this.labelCount++}`, "i1");
    const trueLabel = this.newLabel("or.true");
    const evalRhsLabel = this.newLabel("or.eval_rhs");
    const endLabel = this.newLabel("or.end");

    this.emit(
      `  br i1 ${leftVal}, label %${trueLabel}, label %${evalRhsLabel}`,
    );

    this.emit(`${trueLabel}:`);
    this.emit(`  store i1 1, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${evalRhsLabel}:`);
    const rightVal = this.generateExpression(expr.right);
    this.emit(`  store i1 ${rightVal}, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${endLabel}:`);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load i1, i1* ${resPtr}`);
    return reg;
  }

  /**
   * Generate binary operation
   */
  protected generateBinary(expr: AST.BinaryExpr): string {
    // Check for operator overload
    if (expr.operatorOverload) {
      return this.generateOperatorOverloadCall(expr);
    }

    const leftRaw = this.generateExpression(expr.left);
    const rightRaw = this.generateExpression(expr.right);
    const leftType = this.resolveType(expr.left.resolvedType!);
    const rightType = this.resolveType(expr.right.resolvedType!);

    // Handle equality operators
    const isEqOp =
      expr.operator.type === TokenType.EqualEqual ||
      expr.operator.type === TokenType.BangEqual;

    if (isEqOp) {
      const result = this.handleEqualityComparison(
        expr,
        leftRaw,
        rightRaw,
        leftType,
        rightType,
      );
      if (result !== null) return result;
    }

    // Pointer arithmetic
    const ptrResult = this.handlePointerArithmetic(
      expr,
      leftRaw,
      rightRaw,
      leftType,
      rightType,
    );
    if (ptrResult !== null) return ptrResult;

    // Standard binary operations
    return this.generateStandardBinaryOp(expr, leftRaw, rightRaw, leftType);
  }

  /**
   * Generate operator overload call
   */
  private generateOperatorOverloadCall(expr: AST.BinaryExpr): string {
    const overload = expr.operatorOverload!;
    const method = overload.methodDeclaration;
    const leftRaw = this.generateExpression(expr.left);
    const rightRaw = this.generateExpression(expr.right);

    const targetType = overload.targetType as AST.BasicTypeNode;
    const { mangledName, resolvedMethodType } = this.resolveOperatorMethod(
      method,
      targetType,
    );

    const leftType = this.resolveType(expr.left.resolvedType!);
    const rightType = this.resolveType(expr.right.resolvedType!);

    let thisVal = leftRaw;
    let thisType = leftType;
    let otherVal = rightRaw;
    let otherType = rightType;
    let thisExpr = expr.left;
    let otherExpr = expr.right;

    if (overload.swapOperands) {
      thisVal = rightRaw;
      thisType = rightType;
      otherVal = leftRaw;
      otherType = leftType;
      thisExpr = expr.right;
      otherExpr = expr.left;
    }

    const thisArg = this.prepareThisArg(thisVal, thisType, thisExpr);
    const { val: finalOtherVal, type: finalOtherType } = this.prepareOtherArg(
      otherVal,
      otherType,
      otherExpr,
      resolvedMethodType,
    );

    const returnType = this.resolveType(resolvedMethodType.returnType);
    expr.resolvedType = resolvedMethodType.returnType;

    const resultReg = this.newRegister();
    this.emit(
      `  ${resultReg} = call ${returnType} @${mangledName}(i8* null, ${thisArg}, ${finalOtherType} ${finalOtherVal})`,
    );

    if (overload.negateResult) {
      const negated = this.newRegister();
      this.emit(`  ${negated} = xor i1 ${resultReg}, true`);
      return negated;
    }

    return resultReg;
  }

  /**
   * Resolve operator method name and type
   */
  private resolveOperatorMethod(
    method: AST.FunctionDecl,
    targetType: AST.BasicTypeNode,
  ): { mangledName: string; resolvedMethodType: AST.FunctionTypeNode } {
    if (targetType.genericArgs && targetType.genericArgs.length > 0) {
      const structDecl = this.structMap.get(targetType.name);
      const enumDecl = this.enumDeclMap.get(targetType.name);

      if (
        (structDecl && structDecl.genericParams.length > 0) ||
        (enumDecl && enumDecl.genericParams.length > 0)
      ) {
        const genericParams = structDecl
          ? structDecl.genericParams
          : enumDecl!.genericParams;

        if (structDecl) {
          const substitutedArgs = targetType.genericArgs.map((arg) =>
            this.substituteType(arg, this.currentTypeMap),
          );
          this.resolveMonomorphizedType(structDecl, substitutedArgs);
        }

        const contextMap = new Map<string, AST.TypeNode>();
        for (let i = 0; i < genericParams.length; i++) {
          contextMap.set(genericParams[i]!.name, targetType.genericArgs[i]!);
        }

        const argNames = targetType.genericArgs
          .map((arg) => this.mangleType(arg))
          .join("_");
        const structName = `${targetType.name}_${argNames}`;

        const methodType = method.resolvedType as AST.FunctionTypeNode;
        const fullMethodName = `${structName}_${method.name}`;
        const substitutedMethodType = this.substituteType(
          methodType,
          contextMap,
        ) as AST.FunctionTypeNode;

        return {
          mangledName: this.getMangledName(
            fullMethodName,
            substitutedMethodType,
          ),
          resolvedMethodType: substitutedMethodType,
        };
      }
    }

    const structName = targetType.name;
    const methodType = method.resolvedType as AST.FunctionTypeNode;
    const fullMethodName = `${structName}_${method.name}`;
    return {
      mangledName: this.getMangledName(fullMethodName, methodType),
      resolvedMethodType: methodType,
    };
  }

  /**
   * Prepare 'this' argument for operator call
   */
  private prepareThisArg(
    thisVal: string,
    thisType: string,
    thisExpr: AST.Expression,
  ): string {
    if (thisType.endsWith("*")) {
      return `${thisType} ${thisVal}`;
    }

    let thisPtr: string;
    try {
      thisPtr = this.generateAddress(thisExpr);
    } catch {
      const spillAddr = this.allocateStack(
        `op_spill_${this.labelCount++}`,
        thisType,
      );
      this.emit(`  store ${thisType} ${thisVal}, ${thisType}* ${spillAddr}`);
      thisPtr = spillAddr;
    }
    return `${thisType}* ${thisPtr}`;
  }

  /**
   * Prepare other argument for operator call
   */
  private prepareOtherArg(
    otherVal: string,
    otherType: string,
    otherExpr: AST.Expression,
    methodType: AST.FunctionTypeNode,
  ): { val: string; type: string } {
    if (methodType.paramTypes.length >= 2) {
      const expectedTypeNode = methodType.paramTypes[1]!;
      const expectedType = this.resolveType(expectedTypeNode);

      if (expectedType.endsWith("*") && !otherType.endsWith("*")) {
        let otherPtr: string;
        try {
          otherPtr = this.generateAddress(otherExpr);
        } catch {
          const spillAddr = this.allocateStack(
            `op_arg_spill_${this.labelCount++}`,
            otherType,
          );
          this.emit(
            `  store ${otherType} ${otherVal}, ${otherType}* ${spillAddr}`,
          );
          otherPtr = spillAddr;
        }
        return { val: otherPtr, type: `${otherType}*` };
      }
    }
    return { val: otherVal, type: otherType };
  }

  /**
   * Handle equality comparison operations
   */
  private handleEqualityComparison(
    expr: AST.BinaryExpr,
    leftRaw: string,
    rightRaw: string,
    leftType: string,
    rightType: string,
  ): string | null {
    const isNullLiteral = (e: AST.Expression) =>
      e.kind === "Literal" && (e as AST.LiteralExpr).type === "null";

    const isStructValue = (tNode: AST.TypeNode | undefined) => {
      if (!tNode || tNode.kind !== "BasicType") return false;
      const b = tNode as AST.BasicTypeNode;
      return b.pointerDepth === 0 && this.structMap.has(b.name);
    };

    // Struct vs null comparison
    if (isStructValue(expr.left.resolvedType) && isNullLiteral(expr.right)) {
      const res = "0";
      if (expr.operator.type === TokenType.EqualEqual) return res;
      const inv = this.newRegister();
      this.emit(`  ${inv} = xor i1 ${res}, true`);
      return inv;
    }

    if (isStructValue(expr.right.resolvedType) && isNullLiteral(expr.left)) {
      const res = "0";
      if (expr.operator.type === TokenType.EqualEqual) return res;
      const inv = this.newRegister();
      this.emit(`  ${inv} = xor i1 ${res}, true`);
      return inv;
    }

    // Enum comparison
    if (isEnumType(leftType) && isEnumType(rightType)) {
      return this.generateEnumComparison(expr, leftRaw, rightRaw, leftType);
    }

    // Struct comparison
    if (
      leftType.startsWith("%struct.") &&
      !leftType.endsWith("*") &&
      rightType.startsWith("%struct.") &&
      !rightType.endsWith("*")
    ) {
      const structName = leftType.substring(8);
      return this.generateStructComparison(
        structName,
        leftRaw,
        rightRaw,
        expr.operator.type === TokenType.EqualEqual,
      );
    }

    return null;
  }

  /**
   * Generate enum comparison
   */
  private generateEnumComparison(
    expr: AST.BinaryExpr,
    leftRaw: string,
    rightRaw: string,
    enumTypeName: string,
  ): string {
    const enumName = enumTypeName.substring(6);
    const leftVal = leftRaw;
    const rightVal = rightRaw;

    const leftTag = this.newRegister();
    this.emit(`  ${leftTag} = extractvalue ${enumTypeName} ${leftVal}, 0`);
    const rightTag = this.newRegister();
    this.emit(`  ${rightTag} = extractvalue ${enumTypeName} ${rightVal}, 0`);

    const tagsEqual = this.newRegister();
    this.emit(`  ${tagsEqual} = icmp eq i32 ${leftTag}, ${rightTag}`);

    const dataSize = this.enumDataSizes.get(enumName) || 0;

    if (dataSize > 0) {
      const leftPtr = this.allocateStack(
        `enum_cmp_left_${this.labelCount}`,
        enumTypeName,
      );
      this.emit(
        `  store ${enumTypeName} ${leftVal}, ${enumTypeName}* ${leftPtr}`,
      );

      const rightPtr = this.allocateStack(
        `enum_cmp_right_${this.labelCount++}`,
        enumTypeName,
      );
      this.emit(
        `  store ${enumTypeName} ${rightVal}, ${enumTypeName}* ${rightPtr}`,
      );

      const leftDataPtr = this.newRegister();
      this.emit(
        `  ${leftDataPtr} = getelementptr inbounds ${enumTypeName}, ${enumTypeName}* ${leftPtr}, i32 0, i32 1`,
      );
      const leftDataI8Ptr = this.newRegister();
      this.emit(
        `  ${leftDataI8Ptr} = bitcast [${dataSize} x i8]* ${leftDataPtr} to i8*`,
      );

      const rightDataPtr = this.newRegister();
      this.emit(
        `  ${rightDataPtr} = getelementptr inbounds ${enumTypeName}, ${enumTypeName}* ${rightPtr}, i32 0, i32 1`,
      );
      const rightDataI8Ptr = this.newRegister();
      this.emit(
        `  ${rightDataI8Ptr} = bitcast [${dataSize} x i8]* ${rightDataPtr} to i8*`,
      );

      const memcmpResult = this.newRegister();
      this.emit(
        `  ${memcmpResult} = call i32 @memcmp(i8* ${leftDataI8Ptr}, i8* ${rightDataI8Ptr}, i64 ${dataSize})`,
      );

      const dataEqual = this.newRegister();
      this.emit(`  ${dataEqual} = icmp eq i32 ${memcmpResult}, 0`);

      const result = this.newRegister();
      this.emit(`  ${result} = and i1 ${tagsEqual}, ${dataEqual}`);

      if (expr.operator.type === TokenType.BangEqual) {
        const notResult = this.newRegister();
        this.emit(`  ${notResult} = xor i1 ${result}, true`);
        return notResult;
      }
      return result;
    }

    if (expr.operator.type === TokenType.BangEqual) {
      const notResult = this.newRegister();
      this.emit(`  ${notResult} = xor i1 ${tagsEqual}, true`);
      return notResult;
    }
    return tagsEqual;
  }

  /**
   * Handle pointer arithmetic
   */
  private handlePointerArithmetic(
    expr: AST.BinaryExpr,
    leftRaw: string,
    rightRaw: string,
    leftType: string,
    rightType: string,
  ): string | null {
    // ptr + int or ptr - int
    if (leftType.endsWith("*") && this.isIntegerType(rightType)) {
      let right = rightRaw;
      if (rightType !== "i64") {
        const castReg = this.newRegister();
        if (this.isSigned(expr.right.resolvedType!)) {
          this.emit(`  ${castReg} = sext ${rightType} ${rightRaw} to i64`);
        } else {
          this.emit(`  ${castReg} = zext ${rightType} ${rightRaw} to i64`);
        }
        right = castReg;
      }

      if (expr.operator.type === TokenType.Plus) {
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = getelementptr inbounds ${leftType.slice(0, -1)}, ${leftType} ${leftRaw}, i64 ${right}`,
        );
        return reg;
      }

      if (expr.operator.type === TokenType.Minus) {
        const negRight = this.newRegister();
        this.emit(`  ${negRight} = sub i64 0, ${right}`);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = getelementptr inbounds ${leftType.slice(0, -1)}, ${leftType} ${leftRaw}, i64 ${negRight}`,
        );
        return reg;
      }
    }

    // int + ptr (commutative)
    if (
      this.isIntegerType(leftType) &&
      rightType.endsWith("*") &&
      expr.operator.type === TokenType.Plus
    ) {
      let left = leftRaw;
      if (leftType !== "i64") {
        const castReg = this.newRegister();
        if (this.isSigned(expr.left.resolvedType!)) {
          this.emit(`  ${castReg} = sext ${leftType} ${leftRaw} to i64`);
        } else {
          this.emit(`  ${castReg} = zext ${leftType} ${leftRaw} to i64`);
        }
        left = castReg;
      }

      const reg = this.newRegister();
      this.emit(
        `  ${reg} = getelementptr inbounds ${rightType.slice(0, -1)}, ${rightType} ${rightRaw}, i64 ${left}`,
      );
      return reg;
    }

    return null;
  }

  /**
   * Generate standard binary operation
   */
  private generateStandardBinaryOp(
    expr: AST.BinaryExpr,
    left: string,
    right: string,
    leftType: string,
  ): string {
    const isFloat = leftType === "double" || leftType === "float";
    const isUnsigned = !isFloat && !this.isSigned(expr.left.resolvedType!);
    const rightType = this.resolveType(expr.right.resolvedType!);

    let op = "";
    let finalRight = right;

    switch (expr.operator.type) {
      case TokenType.Plus:
        op = isFloat ? "fadd" : "add";
        break;
      case TokenType.Minus:
        op = isFloat ? "fsub" : "sub";
        break;
      case TokenType.Star:
        op = isFloat ? "fmul" : "mul";
        break;
      case TokenType.Slash:
        op = this.getDivisionOp(isFloat, isUnsigned, right, rightType);
        break;
      case TokenType.EqualEqual:
        op = isFloat ? "fcmp oeq" : "icmp eq";
        break;
      case TokenType.BangEqual:
        op = isFloat ? "fcmp one" : "icmp ne";
        break;
      case TokenType.Less:
        if (isFloat) {
          op = "fcmp olt";
        } else {
          op = isUnsigned ? "icmp ult" : "icmp slt";
        }
        break;
      case TokenType.LessEqual:
        if (isFloat) {
          op = "fcmp ole";
        } else {
          op = isUnsigned ? "icmp ule" : "icmp sle";
        }
        break;
      case TokenType.Greater:
        if (isFloat) {
          op = "fcmp ogt";
        } else {
          op = isUnsigned ? "icmp ugt" : "icmp sgt";
        }
        break;
      case TokenType.GreaterEqual:
        if (isFloat) {
          op = "fcmp oge";
        } else {
          op = isUnsigned ? "icmp uge" : "icmp sge";
        }
        break;
      case TokenType.Percent:
        op = this.getModuloOp(isFloat, isUnsigned, right, rightType);
        break;
      case TokenType.Ampersand:
        op = "and";
        break;
      case TokenType.Pipe:
        op = "or";
        break;
      case TokenType.Caret:
        op = "xor";
        break;
      case TokenType.LessLess:
        op = "shl";
        finalRight = this.maskShiftAmount(right, rightType, leftType);
        break;
      case TokenType.GreaterGreater:
        op = isUnsigned ? "lshr" : "ashr";
        finalRight = this.maskShiftAmount(right, rightType, leftType);
        break;
    }

    if (op) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = ${op} ${leftType} ${left}, ${finalRight}`);
      return reg;
    }
    return "0";
  }

  /**
   * Get division operation with zero check
   */
  private getDivisionOp(
    isFloat: boolean,
    isUnsigned: boolean,
    right: string,
    rightType: string,
  ): string {
    if (isFloat) {
      return "fdiv";
    }

    this.emitDivisionByZeroCheck(right, rightType);
    return isUnsigned ? "udiv" : "sdiv";
  }

  /**
   * Get modulo operation with zero check
   */
  private getModuloOp(
    isFloat: boolean,
    isUnsigned: boolean,
    right: string,
    rightType: string,
  ): string {
    if (isFloat) {
      return "frem";
    }

    this.emitDivisionByZeroCheck(right, rightType);
    return isUnsigned ? "urem" : "srem";
  }

  /**
   * Emit division by zero check
   */
  private emitDivisionByZeroCheck(right: string, rightType: string): void {
    const isZero = this.newRegister();
    this.emit(`  ${isZero} = icmp eq ${rightType} ${right}, 0`);
    const okLabel = this.newLabel("div_ok");
    const errLabel = this.newLabel("div_err");
    this.emit(`  br i1 ${isZero}, label %${errLabel}, label %${okLabel}`);

    this.emit(`${errLabel}:`);
    const errorStruct = this.buildDivisionByZeroError();
    this.emitThrow(errorStruct, "%struct.DivisionByZeroError");

    this.emit(`${okLabel}:`);
  }

  /**
   * Build DivisionByZeroError struct
   */
  private buildDivisionByZeroError(): string {
    const msg = "Division by zero";
    if (!this.stringLiterals.has(msg)) {
      this.stringLiterals.set(
        msg,
        `@.div_zero_msg.${this.stringLiterals.size}`,
      );
    }
    const msgLen = msg.length + 1;
    const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;

    const layout = this.structLayouts.get("DivisionByZeroError");
    let currentStruct = "undef";

    if (layout) {
      if (layout.has("__vtable__")) {
        const vtableIndex = layout.get("__vtable__");
        const vtablePtr = this.newRegister();
        this.emit(
          `  ${vtablePtr} = bitcast [3 x i8*]* @DivisionByZeroError_vtable to i8*`,
        );
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("message")) {
        const idx = layout.get("message");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
        );
        currentStruct = nextStruct;
      }
      if (layout.has("code")) {
        const idx = layout.get("code");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i32 8, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("dummy")) {
        const dummyIndex = layout.get("dummy");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8 0, ${dummyIndex}`,
        );
        currentStruct = nextStruct;
      }
    } else {
      const nextStruct = this.newRegister();
      this.emit(
        `  ${nextStruct} = insertvalue %struct.DivisionByZeroError undef, i8 0, 0`,
      );
      currentStruct = nextStruct;
    }
    return currentStruct;
  }

  /**
   * Mask shift amount to prevent undefined behavior
   */
  private maskShiftAmount(
    right: string,
    rightType: string,
    leftType: string,
  ): string {
    let bitWidth = 32;
    if (leftType === "i64") bitWidth = 64;
    else if (leftType === "i32") bitWidth = 32;
    else if (leftType === "i16") bitWidth = 16;
    else if (leftType === "i8") bitWidth = 8;

    const maskVal = bitWidth - 1;
    const maskedRight = this.newRegister();
    this.emit(`  ${maskedRight} = and ${rightType} ${right}, ${maskVal}`);
    return maskedRight;
  }

  /**
   * Generate struct field-by-field comparison
   */
  protected generateStructComparison(
    structName: string,
    leftVal: string,
    rightVal: string,
    isEqualOp: boolean,
  ): string {
    const structDecl = this.structMap.get(structName);
    if (!structDecl) {
      return this.generateFallbackStructComparison(
        structName,
        leftVal,
        rightVal,
        isEqualOp,
      );
    }

    const fields = this.getAllStructFields(structDecl);
    const hasVTable =
      this.vtableLayouts.has(structName) &&
      this.vtableLayouts.get(structName)!.length > 0;
    const offset = hasVTable ? 1 : 0;

    let resultReg = "true";

    for (let i = 0; i < fields.length; i++) {
      const fieldType = this.resolveType(fields[i]!.type);
      const llvmIndex = i + offset;

      const leftField = this.newRegister();
      this.emit(
        `  ${leftField} = extractvalue %struct.${structName} ${leftVal}, ${llvmIndex}`,
      );

      const rightField = this.newRegister();
      this.emit(
        `  ${rightField} = extractvalue %struct.${structName} ${rightVal}, ${llvmIndex}`,
      );

      const cmpReg = this.compareFields(fieldType, leftField, rightField);

      const newResult = this.newRegister();
      this.emit(`  ${newResult} = and i1 ${resultReg}, ${cmpReg}`);
      resultReg = newResult;
    }

    if (!isEqualOp) {
      const notResult = this.newRegister();
      this.emit(`  ${notResult} = xor i1 ${resultReg}, true`);
      return notResult;
    }
    return resultReg;
  }

  /**
   * Compare two field values
   */
  private compareFields(
    fieldType: string,
    leftField: string,
    rightField: string,
  ): string {
    if (fieldType.startsWith("%struct.") && !fieldType.endsWith("*")) {
      const nestedStructName = fieldType.substring(8);
      return this.generateStructComparison(
        nestedStructName,
        leftField,
        rightField,
        true,
      );
    }

    if (fieldType.startsWith("%enum.") || fieldType.startsWith("[")) {
      return this.generateMemcmpComparison(fieldType, leftField, rightField);
    }

    const cmpReg = this.newRegister();
    if (fieldType === "float" || fieldType === "double") {
      this.emit(
        `  ${cmpReg} = fcmp oeq ${fieldType} ${leftField}, ${rightField}`,
      );
    } else {
      this.emit(
        `  ${cmpReg} = icmp eq ${fieldType} ${leftField}, ${rightField}`,
      );
    }
    return cmpReg;
  }

  /**
   * Generate memcmp-based comparison for complex types
   */
  private generateMemcmpComparison(
    typeStr: string,
    leftField: string,
    rightField: string,
  ): string {
    const leftPtr = this.allocateStack(`cmp_left_${this.labelCount}`, typeStr);
    this.emit(`  store ${typeStr} ${leftField}, ${typeStr}* ${leftPtr}`);
    const rightPtr = this.allocateStack(
      `cmp_right_${this.labelCount}`,
      typeStr,
    );
    this.emit(`  store ${typeStr} ${rightField}, ${typeStr}* ${rightPtr}`);

    const leftI8 = this.newRegister();
    this.emit(`  ${leftI8} = bitcast ${typeStr}* ${leftPtr} to i8*`);
    const rightI8 = this.newRegister();
    this.emit(`  ${rightI8} = bitcast ${typeStr}* ${rightPtr} to i8*`);

    const sizePtr = this.newRegister();
    const sizeVal = this.newRegister();
    this.emit(
      `  ${sizePtr} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
    );
    this.emit(`  ${sizeVal} = ptrtoint ${typeStr}* ${sizePtr} to i64`);

    const res = this.newRegister();
    this.emit(
      `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${sizeVal})`,
    );
    const cmpReg = this.newRegister();
    this.emit(`  ${cmpReg} = icmp eq i32 ${res}, 0`);
    return cmpReg;
  }

  /**
   * Fallback struct comparison using memcmp
   */
  private generateFallbackStructComparison(
    structName: string,
    leftVal: string,
    rightVal: string,
    isEqualOp: boolean,
  ): string {
    const typeStr = `%struct.${structName}`;

    const leftPtr = this.allocateStack(
      `cmp_fallback_left_${this.labelCount}`,
      typeStr,
    );
    this.emit(`  store ${typeStr} ${leftVal}, ${typeStr}* ${leftPtr}`);
    const rightPtr = this.allocateStack(
      `cmp_fallback_right_${this.labelCount}`,
      typeStr,
    );
    this.emit(`  store ${typeStr} ${rightVal}, ${typeStr}* ${rightPtr}`);

    const leftI8 = this.newRegister();
    this.emit(`  ${leftI8} = bitcast ${typeStr}* ${leftPtr} to i8*`);
    const rightI8 = this.newRegister();
    this.emit(`  ${rightI8} = bitcast ${typeStr}* ${rightPtr} to i8*`);

    const sizePtr = this.newRegister();
    const sizeVal = this.newRegister();
    this.emit(
      `  ${sizePtr} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
    );
    this.emit(`  ${sizeVal} = ptrtoint ${typeStr}* ${sizePtr} to i64`);

    const res = this.newRegister();
    this.emit(
      `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${sizeVal})`,
    );
    const cmp = this.newRegister();
    this.emit(`  ${cmp} = icmp eq i32 ${res}, 0`);

    if (!isEqualOp) {
      const notCmp = this.newRegister();
      this.emit(`  ${notCmp} = xor i1 ${cmp}, true`);
      return notCmp;
    }
    return cmp;
  }
}
