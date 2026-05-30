/**
 * Handles binary operations, comparisons, and logical operators.
 *
 * Generates code for:
 * - Arithmetic operators (+, -, *, /, %)
 * - Bitwise operators (&, |, ^, <<, >>)
 * - Comparison operators (==, !=, <, >, <=, >=)
 * - Logical operators (&&, ||) with short-circuit evaluation
 * - Compound assignment operators (+=, -=, etc.)
 *
 * @extends AddressExpressionGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { TokenType } from "../../frontend/TokenType";
import { AddressExpressionGenerator } from "./AddressExpressionGenerator";
import { isEnumType } from "./utils";
import { codeGenLog } from "../../common/Logger";

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
      `  ${resultReg} = call ${returnType} @${mangledName}(${thisArg}, ${finalOtherType} ${finalOtherVal})`,
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

    if (leftType.endsWith("*") && rightType.endsWith("*")) {
      return this.generatePointerEqualityComparison(
        leftRaw,
        rightRaw,
        leftType,
        rightType,
        expr.operator.type === TokenType.EqualEqual,
      );
    }

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

    // Generic struct comparison (for unnamed structs like Tuples or Fat Pointers)
    // We use a memcmp-based comparison if the types are compatible and are struct literals
    if (
      leftType.startsWith("{") &&
      rightType.startsWith("{") &&
      !leftType.endsWith("*") &&
      !rightType.endsWith("*")
    ) {
      // Check for Tuple type - use element-wise comparison for proper float handling
      if (expr.left.resolvedType?.kind === "TupleType") {
        return this.generateTupleEquality(
          expr,
          leftRaw,
          rightRaw,
          leftType,
          expr.operator.type === TokenType.EqualEqual,
        );
      }

      // Check for Lambda signature { i8*, i8* }
      const normalized = leftType.replace(/\s/g, "");
      const isLambdaSig = normalized === "{i8*,i8*}";
      const isLambdaKind =
        expr.left.resolvedType?.kind === "FunctionType" ||
        expr.left.resolvedType?.kind === "LambdaType";

      if (isLambdaKind || isLambdaSig) {
        return this.generateLambdaEquality(
          expr,
          leftRaw,
          rightRaw,
          leftType,
          expr.operator.type === TokenType.EqualEqual,
        );
      }

      // Fallback for other struct literals (not tuples, not lambdas)
      return this.generateGenericStructEquality(
        leftRaw,
        rightRaw,
        leftType,
        expr.operator.type === TokenType.EqualEqual,
      );
    }

    return null;
  }

  private generatePointerEqualityComparison(
    leftRaw: string,
    rightRaw: string,
    leftType: string,
    rightType: string,
    isEqual: boolean,
  ): string {
    const comparisonType =
      leftType === rightType
        ? leftType
        : leftRaw === "null"
          ? rightType
          : rightRaw === "null"
            ? leftType
            : "i8*";
    const left = this.castPointerForComparison(
      leftRaw,
      leftType,
      comparisonType,
    );
    const right = this.castPointerForComparison(
      rightRaw,
      rightType,
      comparisonType,
    );
    const result = this.newRegister();
    const op = isEqual ? "icmp eq" : "icmp ne";
    this.emit(`  ${result} = ${op} ${comparisonType} ${left}, ${right}`);
    return result;
  }

  private castPointerForComparison(
    value: string,
    fromType: string,
    toType: string,
  ): string {
    if (value === "null" || fromType === toType) return value;
    const casted = this.newRegister();
    this.emit(`  ${casted} = bitcast ${fromType} ${value} to ${toType}`);
    return casted;
  }

  /**
   * Generate fat pointer comparison (Function/Lambda) using memcmp
   */
  private generateFatPointerComparison(
    leftRaw: string,
    rightRaw: string,
    type: string,
    isEqual: boolean,
  ): string {
    // Allocate stack
    const leftPtr = this.allocateStack(`fp_cmp_left_${this.labelCount}`, type);
    this.emit(`  store ${type} ${leftRaw}, ${type}* ${leftPtr}`);

    const rightPtr = this.allocateStack(
      `fp_cmp_right_${this.labelCount++}`,
      type,
    );
    this.emit(`  store ${type} ${rightRaw}, ${type}* ${rightPtr}`);

    // Bitcast to i8*
    const leftI8 = this.newRegister();
    this.emit(`  ${leftI8} = bitcast ${type}* ${leftPtr} to i8*`);
    const rightI8 = this.newRegister();
    this.emit(`  ${rightI8} = bitcast ${type}* ${rightPtr} to i8*`);

    // Call memcmp
    // Function Fat Pointers are ALWAYS 2 pointers (func ptr + ctx ptr) = 16 bytes on 64-bit
    const size = 16;

    const res = this.newRegister();
    this.emit(
      `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${size})`,
    );

    const cmp = this.newRegister();
    this.emit(`  ${cmp} = icmp eq i32 ${res}, 0`);

    if (!isEqual) {
      const not = this.newRegister();
      this.emit(`  ${not} = xor i1 ${cmp}, true`);
      return not;
    }
    return cmp;
  }

  /**
   * Generate generic struct literal equality using memcmp and computed sizeof
   */
  private generateGenericStructEquality(
    left: string,
    right: string,
    type: string,
    isEqual: boolean,
  ): string {
    // Calculate size dynamically using GEP null
    const sizeGep = this.newRegister();
    this.emit(`  ${sizeGep} = getelementptr ${type}, ${type}* null, i32 1`);
    const size = this.newRegister();
    this.emit(`  ${size} = ptrtoint ${type}* ${sizeGep} to i64`);

    // Allocate stack for operands
    const leftPtr = this.allocateStack(`gseq_left_${this.labelCount}`, type);
    this.emit(`  store ${type} ${left}, ${type}* ${leftPtr}`);

    const rightPtr = this.allocateStack(
      `gseq_right_${this.labelCount++}`,
      type,
    );
    this.emit(`  store ${type} ${right}, ${type}* ${rightPtr}`);

    // Bitcast to i8*
    const leftI8 = this.newRegister();
    this.emit(`  ${leftI8} = bitcast ${type}* ${leftPtr} to i8*`);
    const rightI8 = this.newRegister();
    this.emit(`  ${rightI8} = bitcast ${type}* ${rightPtr} to i8*`);

    // Call memcmp
    const res = this.newRegister();
    this.emit(
      `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${size})`,
    );

    const cmp = this.newRegister();
    this.emit(`  ${cmp} = icmp eq i32 ${res}, 0`);

    if (isEqual) {
      return cmp;
    }
    const not = this.newRegister();
    this.emit(`  ${not} = xor i1 ${cmp}, true`);
    return not;
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
    // ptr - ptr (pointer subtraction)
    if (
      leftType.endsWith("*") &&
      rightType.endsWith("*") &&
      expr.operator.type === TokenType.Minus
    ) {
      // Convert both pointers to integers
      const leftInt = this.newRegister();
      const rightInt = this.newRegister();
      this.emit(`  ${leftInt} = ptrtoint ${leftType} ${leftRaw} to i64`);
      this.emit(`  ${rightInt} = ptrtoint ${rightType} ${rightRaw} to i64`);

      // Subtract
      const diff = this.newRegister();
      this.emit(`  ${diff} = sub i64 ${leftInt}, ${rightInt}`);

      // Get element size using sizeof
      const elementType = leftType.slice(0, -1); // Remove trailing *
      const sizeofReg = this.newRegister();
      this.emit(
        `  ${sizeofReg} = ptrtoint ${elementType}* getelementptr (${elementType}, ${elementType}* null, i32 1) to i64`,
      );

      // Divide difference by element size to get number of elements
      const result = this.newRegister();
      this.emit(`  ${result} = sdiv i64 ${diff}, ${sizeofReg}`);

      return result;
    }

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
          `  ${reg} = getelementptr ${leftType.slice(0, -1)}, ${leftType} ${leftRaw}, i64 ${right}`,
        );
        return reg;
      }

      if (expr.operator.type === TokenType.Minus) {
        const negRight = this.newRegister();
        this.emit(`  ${negRight} = sub i64 0, ${right}`);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = getelementptr ${leftType.slice(0, -1)}, ${leftType} ${leftRaw}, i64 ${negRight}`,
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
        `  ${reg} = getelementptr ${rightType.slice(0, -1)}, ${rightType} ${rightRaw}, i64 ${left}`,
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
        op = this.getDivisionOp(
          isFloat,
          isUnsigned,
          left,
          right,
          leftType,
        );
        break;
      case TokenType.EqualEqual:
        // Check for array equality
        if (expr.left.resolvedType?.kind === "BasicType") {
          const leftBasic = expr.left.resolvedType as AST.BasicTypeNode;
          if (
            leftBasic.arrayDimensions.length > 0 &&
            leftBasic.pointerDepth === 0
          ) {
            return this.generateArrayEquality(
              expr,
              left,
              right,
              leftType,
              true,
            );
          }
          // Check for struct equality
          if (leftBasic.pointerDepth === 0 && leftType.startsWith("%struct.")) {
            return this.generateStructEquality(
              expr,
              left,
              right,
              leftType,
              true,
            );
          }
        }
        // Check for tuple equality
        if (expr.left.resolvedType?.kind === "TupleType") {
          return this.generateTupleEquality(expr, left, right, leftType, true);
        }

        // Check for lambda equality
        if (expr.left.resolvedType?.kind === "LambdaType") {
          return this.generateLambdaEquality(expr, left, right, leftType, true);
        }

        op = isFloat ? "fcmp oeq" : "icmp eq";
        break;
      case TokenType.BangEqual:
        // Check for array inequality
        if (expr.left.resolvedType?.kind === "BasicType") {
          const leftBasic = expr.left.resolvedType as AST.BasicTypeNode;
          if (
            leftBasic.arrayDimensions.length > 0 &&
            leftBasic.pointerDepth === 0
          ) {
            return this.generateArrayEquality(
              expr,
              left,
              right,
              leftType,
              false,
            );
          }
          // Check for struct inequality
          if (leftBasic.pointerDepth === 0 && leftType.startsWith("%struct.")) {
            return this.generateStructEquality(
              expr,
              left,
              right,
              leftType,
              false,
            );
          }
        }
        // Check for tuple inequality
        if (expr.left.resolvedType?.kind === "TupleType") {
          return this.generateTupleEquality(expr, left, right, leftType, false);
        }

        // Check for lambda inequality
        if (expr.left.resolvedType?.kind === "LambdaType") {
          return this.generateLambdaEquality(
            expr,
            left,
            right,
            leftType,
            false,
          );
        }

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
        op = this.getModuloOp(
          isFloat,
          isUnsigned,
          left,
          right,
          leftType,
        );
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
   * Generate lambda equality check
   * Lambdas are fat pointers { func_ptr, ctx_ptr }
   */
  private generateLambdaEquality(
    expr: AST.BinaryExpr,
    left: string,
    right: string,
    type: string,
    isEqual: boolean,
  ): string {
    // 1. Extract function pointers
    const leftFunc = this.newRegister();
    this.emit(`  ${leftFunc} = extractvalue ${type} ${left}, 0`);
    const rightFunc = this.newRegister();
    this.emit(`  ${rightFunc} = extractvalue ${type} ${right}, 0`);

    // 2. Extract context pointers
    const leftCtx = this.newRegister();
    this.emit(`  ${leftCtx} = extractvalue ${type} ${left}, 1`);
    const rightCtx = this.newRegister();
    this.emit(`  ${rightCtx} = extractvalue ${type} ${right}, 1`);

    // 3. Compare function pointers
    const funcCmp = this.newRegister();
    this.emit(`  ${funcCmp} = icmp eq ptr ${leftFunc}, ${rightFunc}`);

    // 4. Compare context pointers
    const ctxCmp = this.newRegister();
    this.emit(`  ${ctxCmp} = icmp eq i8* ${leftCtx}, ${rightCtx}`);

    // 5. Combine results
    const combined = this.newRegister();
    this.emit(`  ${combined} = and i1 ${funcCmp}, ${ctxCmp}`);

    if (isEqual) {
      return combined;
    }
    const result = this.newRegister();
    this.emit(`  ${result} = xor i1 ${combined}, true`);
    return result;
  }

  /**
   * Generate struct equality check
   * First check for __eq__ method, if not present do member-wise comparison
   */
  private generateStructEquality(
    expr: AST.BinaryExpr,
    left: string,
    right: string,
    type: string,
    isEqual: boolean,
  ): string {
    const structName = type.substring(8); // Remove %struct.
    const decl = this.structMap.get(structName);

    if (!decl) {
      codeGenLog.warn(
        `Struct definition not found for equality check: ${structName}`,
      );
      return "0"; // Should fallback to icmp but that fails for aggregates
    }

    // 1. Check for __eq__ overload
    // Note: This logic duplicates generateOperatorOverloadCall somewhat but specifically for implicit equality usage
    // However, binary operator generation logic usually handles explicit overloads BEFORE calling this switch.
    // If we are here, it implies either no overload was found by TypeChecker OR implicit generation is needed.
    // In BPL, `==` on structs defaults to member-wise unless `__eq__` is defined.

    // If implicit equality via method is desired, we should really be using the operator overload logic.
    // However, if the user didn't explicitly implement it, we do member-wise.

    // 2. Member-wise comparison
    // We need to compare every field.
    const resultPtr = this.allocateStack(
      `struct_eq_${this.labelCount++}`,
      "i1",
    );
    this.emit(`  store i1 1, i1* ${resultPtr}`); // Assume true initially

    const falseLabel = this.newLabel("struct_eq_false");
    const endLabel = this.newLabel("struct_eq_end");

    const fields = this.getAllStructFields(decl);

    // If struct has vtable (inherited from Type), skip the first field (vtable ptr)
    // Actually, we should check layout.
    const layout = this.structLayouts.get(structName);
    const hasVTable = layout && layout.has("__vtable__");
    const startIndex = hasVTable ? 1 : 0;

    for (let i = startIndex; i < fields.length + startIndex; i++) {
      // Adjust index if vtable is present (virtual index vs physical index)
      // structLayouts map logical names to indices.
      // fields[] is the AST definition order.
      // We can just iterate the layout entries sorted by index.
    }

    // Better: iterate sorted layout
    if (layout) {
      const sortedEntries = Array.from(layout.entries()).sort(
        (a, b) => a[1] - b[1],
      );

      for (const [fieldName, index] of sortedEntries) {
        if (fieldName === "__vtable__") continue; // Don't compare vtables? Or should we? Usually identical for same type.
        if (fieldName === "__base__") {
          // Handle base class comparison?
          // If base is a struct, we should recurse.
          // For simplicity, treat as field.
        }

        const field = fields.find((f) => f.name === fieldName);
        if (!field && fieldName !== "__base__") continue;

        // Determine type of field
        // We can't easily resolving AST type here without context passed down.
        // But we have the struct definition.

        // Extract values
        const leftVal = this.newRegister();
        this.emit(`  ${leftVal} = extractvalue ${type} ${left}, ${index}`);

        const rightVal = this.newRegister();
        this.emit(`  ${rightVal} = extractvalue ${type} ${right}, ${index}`);

        // We need to generate comparison for these values.
        // Recursive call? We can't easily recurse into this function because we need AST nodes for types.
        // Instead, we can emit basic comparisons based on LLVM type if we can determine it.

        // To determine the LLVM type of the field:
        // We can inspect the operand type of extractvalue? No, we emit strings.
        // We must resolve the AST type.
        let fieldType: AST.TypeNode | undefined;

        if (fieldName === "__base__") {
          // It's the parent struct.
          // We need to find the parent type from `extends`.
          // This is complex.
          // Valid workaround: Recurse into fields of parent?
          // "Type" parent has no fields except vtable which we skip.
          continue;
        } else {
          fieldType = field!.type;
        }

        // Recursively generate comparison is tricky without full AST expressions.
        // BUT, we can use a helper method that compares two LLVM values given their AST type.
        const areEqual = this.generateValueEquality(
          leftVal,
          rightVal,
          fieldType!,
        );
        const cond = this.newRegister();
        this.emit(`  ${cond} = icmp eq i1 ${areEqual}, 0`); // Check if false
        this.emit(
          `  br i1 ${cond}, label %${falseLabel}, label %${this.newLabel("cont")}`,
        );
        this.emit(`${this.getCurrentLabel()}:`);
      }
    }

    this.emit(`  br label %${endLabel}`);

    this.emit(`${falseLabel}:`);
    this.emit(`  store i1 0, i1* ${resultPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${endLabel}:`);
    const finalRes = this.newRegister();
    this.emit(`  ${finalRes} = load i1, i1* ${resultPtr}`);

    if (isEqual) {
      return finalRes;
    }
    const negated = this.newRegister();
    this.emit(`  ${negated} = xor i1 ${finalRes}, true`);
    return negated;
  }

  private generateValueEquality(
    left: string,
    right: string,
    typeNode: AST.TypeNode,
  ): string {
    const llvmType = this.resolveType(typeNode);

    // Primitives
    if (
      this.isPrimitive(
        typeNode.kind === "BasicType"
          ? (typeNode as AST.BasicTypeNode).name
          : "",
      ) &&
      (typeNode as any).pointerDepth === 0
    ) {
      if (llvmType === "double" || llvmType === "float") {
        const cmp = this.newRegister();
        this.emit(`  ${cmp} = fcmp oeq ${llvmType} ${left}, ${right}`);
        return cmp;
      }
      const cmp = this.newRegister();
      this.emit(`  ${cmp} = icmp eq ${llvmType} ${left}, ${right}`);
      return cmp;
    }

    // Pointers
    const ptrDepth = (typeNode as any).pointerDepth || 0;
    if (ptrDepth > 0) {
      const cmp = this.newRegister();
      this.emit(`  ${cmp} = icmp eq ${llvmType} ${left}, ${right}`);
      return cmp;
    }
    // Structs
    if (typeNode.kind === "BasicType") {
      const basicType = typeNode as AST.BasicTypeNode;
      if (basicType.pointerDepth === 0 && llvmType.startsWith("%struct.")) {
        return this.generateStructEquality_Inner(left, right, llvmType);
      }
    }

    // Lambdas
    if (typeNode.kind === "LambdaType") {
      return this.generateLambdaEquality_Inner(left, right, llvmType);
    }

    // Generic struct literal fallback (e.g. Tuples, or Lambdas where Kind check failed)
    // This prevents icmp on aggregate types
    if (llvmType.startsWith("{") && !llvmType.endsWith("*")) {
      return this.generateGenericStructEquality(left, right, llvmType, true);
    }

    // Default fallback (pointers, etc)
    const cmp = this.newRegister();
    this.emit(`  ${cmp} = icmp eq ${llvmType} ${left}, ${right}`);
    return cmp;
  }

  private generateLambdaEquality_Inner(
    left: string,
    right: string,
    type: string,
  ): string {
    // Duplicate logic from generateLambdaEquality but return result directly
    const leftFunc = this.newRegister();
    this.emit(`  ${leftFunc} = extractvalue ${type} ${left}, 0`);
    const rightFunc = this.newRegister();
    this.emit(`  ${rightFunc} = extractvalue ${type} ${right}, 0`);

    const leftCtx = this.newRegister();
    this.emit(`  ${leftCtx} = extractvalue ${type} ${left}, 1`);
    const rightCtx = this.newRegister();
    this.emit(`  ${rightCtx} = extractvalue ${type} ${right}, 1`);

    const funcCmp = this.newRegister();
    this.emit(`  ${funcCmp} = icmp eq ptr ${leftFunc}, ${rightFunc}`);

    const ctxCmp = this.newRegister();
    this.emit(`  ${ctxCmp} = icmp eq i8* ${leftCtx}, ${rightCtx}`);

    const combined = this.newRegister();
    this.emit(`  ${combined} = and i1 ${funcCmp}, ${ctxCmp}`);
    return combined;
  }

  private generateStructEquality_Inner(
    left: string,
    right: string,
    type: string,
  ): string {
    const structName = type.substring(8);
    const decl = this.structMap.get(structName);
    if (!decl) return "0";

    const resPtr = this.allocateStack(
      `struct_inner_eq_${this.labelCount++}`,
      "i1",
    );
    this.emit(`  store i1 1, i1* ${resPtr}`);

    const falseLabel = this.newLabel("seq_fls");
    const endLabel = this.newLabel("seq_end");

    const layout = this.structLayouts.get(structName);
    if (layout) {
      const sorted = Array.from(layout.entries()).sort((a, b) => a[1] - b[1]);
      const fields = this.getAllStructFields(decl);

      for (const [name, idx] of sorted) {
        if (name === "__vtable__") continue;
        // Lookup field type
        // If it's a base class field, we have to look into inheritance...
        // Simplification: if name is not in fields list, it might be inherited.
        // getAllStructFields includes inherited fields for us!
        const field = fields.find((f) => f.name === name);
        if (!field) continue; // Should effectively handle __base__ if mapped correctly or skipped

        const lVal = this.newRegister();
        this.emit(`  ${lVal} = extractvalue ${type} ${left}, ${idx}`);
        const rVal = this.newRegister();
        this.emit(`  ${rVal} = extractvalue ${type} ${right}, ${idx}`);

        const eq = this.generateValueEquality(
          lVal,
          rVal,
          field ? field.type : (null as any),
        );
        const isFalse = this.newRegister();
        this.emit(`  ${isFalse} = icmp eq i1 ${eq}, 0`);
        const nextLabel = this.newLabel("seq_nxt");
        this.emit(
          `  br i1 ${isFalse}, label %${falseLabel}, label %${nextLabel}`,
        );
        this.emit(`${nextLabel}:`);
      }
    }

    this.emit(`  br label %${endLabel}`);
    this.emit(`${falseLabel}:`);
    this.emit(`  store i1 0, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);
    this.emit(`${endLabel}:`);

    const res = this.newRegister();
    this.emit(`  ${res} = load i1, i1* ${resPtr}`);
    return res;
  }

  /**
   * Get division operation with zero check
   */
  private getDivisionOp(
    isFloat: boolean,
    isUnsigned: boolean,
    left: string,
    right: string,
    valueType: string,
  ): string {
    if (isFloat) {
      return "fdiv";
    }

    this.emitDivisionByZeroCheck(right, valueType);
    if (!isUnsigned) {
      this.emitSignedDivisionOverflowCheck(left, right, valueType);
    }
    return isUnsigned ? "udiv" : "sdiv";
  }

  /**
   * Get modulo operation with zero check
   */
  private getModuloOp(
    isFloat: boolean,
    isUnsigned: boolean,
    left: string,
    right: string,
    valueType: string,
  ): string {
    if (isFloat) {
      return "frem";
    }

    this.emitDivisionByZeroCheck(right, valueType);
    if (!isUnsigned) {
      this.emitSignedDivisionOverflowCheck(left, right, valueType);
    }
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

    // Call runtime
    const funcNameStr = this.currentFunctionName || "unknown";
    const funcNamePtr = this.getStringLiteralPtr(funcNameStr);

    let line = 0;
    let column = 0;
    if (this.currentStatementLocation) {
      line = this.currentStatementLocation.startLine;
      column = this.currentStatementLocation.startColumn || 0;
    }

    this.emit(
      `  call void @__bpl_throw_division_by_zero(i8* ${funcNamePtr}, i32 ${line}, i32 ${column})`,
    );
    this.emit(`  unreachable`);

    this.emit(`${okLabel}:`);
  }

  /**
   * Emit signed division overflow check for INT_MIN / -1 and INT_MIN % -1.
   */
  private emitSignedDivisionOverflowCheck(
    left: string,
    right: string,
    valueType: string,
  ): void {
    const minValue = this.getSignedIntegerMinValue(valueType);
    if (minValue === null) {
      return;
    }

    const isMin = this.newRegister();
    this.emit(`  ${isMin} = icmp eq ${valueType} ${left}, ${minValue}`);
    const isNegativeOne = this.newRegister();
    this.emit(`  ${isNegativeOne} = icmp eq ${valueType} ${right}, -1`);
    const isOverflow = this.newRegister();
    this.emit(`  ${isOverflow} = and i1 ${isMin}, ${isNegativeOne}`);

    const okLabel = this.newLabel("div_overflow_ok");
    const errLabel = this.newLabel("div_overflow_err");
    this.emit(`  br i1 ${isOverflow}, label %${errLabel}, label %${okLabel}`);

    this.emit(`${errLabel}:`);

    const funcNameStr = this.currentFunctionName || "unknown";
    const funcNamePtr = this.getStringLiteralPtr(funcNameStr);

    let line = 0;
    let column = 0;
    if (this.currentStatementLocation) {
      line = this.currentStatementLocation.startLine;
      column = this.currentStatementLocation.startColumn || 0;
    }

    this.emit(
      `  call void @__bpl_throw_integer_overflow(i8* ${funcNamePtr}, i32 ${line}, i32 ${column})`,
    );
    this.emit(`  unreachable`);

    this.emit(`${okLabel}:`);
  }

  private getSignedIntegerMinValue(valueType: string): string | null {
    switch (valueType) {
      case "i8":
        return "-128";
      case "i16":
        return "-32768";
      case "i32":
        return "-2147483648";
      case "i64":
        return "-9223372036854775808";
      default:
        return null;
    }
  }

  /**
   * Generate array equality comparison using memcmp
   */
  private generateArrayEquality(
    expr: AST.BinaryExpr,
    left: string,
    right: string,
    arrayType: string,
    isEqual: boolean,
  ): string {
    // Get array size from type (e.g., "[5 x i32]" -> 5 elements)
    const match = arrayType.match(/\[(\d+) x (.+)\]/);
    if (!match) {
      throw this.createError(
        "Cannot parse array type for equality comparison",
        expr,
        `Expected array type in format [N x T], got ${arrayType}`,
      );
    }
    const elemCount = parseInt(match[1]!, 10);
    const elemType = match[2]!;

    // Calculate size in bytes
    const elemSize = this.getTypeSize(elemType);
    const totalBytes = elemCount * elemSize;

    // Spill arrays to stack to get addresses
    const leftPtr = this.newRegister();
    this.emit(`  ${leftPtr} = alloca ${arrayType}`);
    this.emit(`  store ${arrayType} ${left}, ${arrayType}* ${leftPtr}`);

    const rightPtr = this.newRegister();
    this.emit(`  ${rightPtr} = alloca ${arrayType}`);
    this.emit(`  store ${arrayType} ${right}, ${arrayType}* ${rightPtr}`);

    // Cast to i8* for memcmp
    const leftBytes = this.newRegister();
    this.emit(`  ${leftBytes} = bitcast ${arrayType}* ${leftPtr} to i8*`);

    const rightBytes = this.newRegister();
    this.emit(`  ${rightBytes} = bitcast ${arrayType}* ${rightPtr} to i8*`);

    // Call memcmp
    const cmpResult = this.newRegister();
    this.emit(
      `  ${cmpResult} = call i32 @memcmp(i8* ${leftBytes}, i8* ${rightBytes}, i64 ${totalBytes})`,
    );

    // Compare result with 0
    const result = this.newRegister();
    const cmpOp = isEqual ? "eq" : "ne";
    this.emit(`  ${result} = icmp ${cmpOp} i32 ${cmpResult}, 0`);

    return result;
  }

  /**
   * Generate tuple equality comparison (member-wise)
   */
  private generateTupleEquality(
    expr: AST.BinaryExpr,
    left: string,
    right: string,
    tupleType: string,
    isEqual: boolean,
  ): string {
    const tupleTypeNode = expr.left.resolvedType as AST.TupleTypeNode;
    const numElements = tupleTypeNode.types.length;

    if (numElements === 0) {
      // Empty tuple is always equal
      return isEqual ? "1" : "0";
    }

    if (numElements === 1) {
      // Single element - direct comparison
      const elemType = this.resolveType(tupleTypeNode.types[0]!);
      const leftElem = this.newRegister();
      this.emit(`  ${leftElem} = extractvalue ${tupleType} ${left}, 0`);
      const rightElem = this.newRegister();
      this.emit(`  ${rightElem} = extractvalue ${tupleType} ${right}, 0`);

      const isFloat = elemType === "double" || elemType === "float";
      let cmpOp: string;
      if (isEqual) {
        cmpOp = isFloat ? "fcmp oeq" : "icmp eq";
      } else {
        cmpOp = isFloat ? "fcmp one" : "icmp ne";
      }
      const result = this.newRegister();
      this.emit(`  ${result} = ${cmpOp} ${elemType} ${leftElem}, ${rightElem}`);
      return result;
    }

    // Multi-element tuple: use short-circuit evaluation
    const finalLabel = this.newLabel("tuple_cmp_end");
    const _startLabel = this.getCurrentLabel(); // Block where we start

    // Build a chain of comparisons with short-circuit evaluation
    const phiInputs: Array<{ value: string; block: string }> = [];

    for (let i = 0; i < numElements; i++) {
      const elemType = this.resolveType(tupleTypeNode.types[i]!);

      // Extract elements
      const leftElem = this.newRegister();
      this.emit(`  ${leftElem} = extractvalue ${tupleType} ${left}, ${i}`);
      const rightElem = this.newRegister();
      this.emit(`  ${rightElem} = extractvalue ${tupleType} ${right}, ${i}`);

      // Compare elements
      const isFloat = elemType === "double" || elemType === "float";
      const cmpOp = isFloat ? "fcmp oeq" : "icmp eq";
      const cmpResult = this.newRegister();
      this.emit(
        `  ${cmpResult} = ${cmpOp} ${elemType} ${leftElem}, ${rightElem}`,
      );

      if (i < numElements - 1) {
        // Not the last element - short circuit if comparison fails/succeeds
        const nextLabel = this.newLabel(`tuple_cmp_${i + 1}`);
        const currentBlock = this.getCurrentLabel();

        if (isEqual) {
          // For ==: if elements not equal, entire tuple is not equal (result = false)
          this.emit(
            `  br i1 ${cmpResult}, label %${nextLabel}, label %${finalLabel}`,
          );
          phiInputs.push({ value: "0", block: currentBlock });
        } else {
          // For !=: if elements not equal, entire tuple is not equal (result = true)
          this.emit(
            `  br i1 ${cmpResult}, label %${finalLabel}, label %${nextLabel}`,
          );
          phiInputs.push({ value: "1", block: currentBlock });
        }

        this.emit(`${nextLabel}:`);
      } else {
        // Last element - use its comparison result (or inverted for !=)
        const currentBlock = this.getCurrentLabel();

        if (isEqual) {
          // For ==: last element comparison determines result
          phiInputs.push({ value: cmpResult, block: currentBlock });
        } else {
          // For !=: invert last comparison (all equal means not-not-equal = false)
          const inverted = this.newRegister();
          this.emit(`  ${inverted} = xor i1 ${cmpResult}, 1`);
          phiInputs.push({ value: inverted, block: currentBlock });
        }

        this.emit(`  br label %${finalLabel}`);
      }
    }

    // Merge block
    this.emit(`${finalLabel}:`);
    const result = this.newRegister();

    // Build phi node with correct predecessors
    const phiParts = phiInputs.map(
      (input) => `[ ${input.value}, %${input.block} ]`,
    );
    this.emit(`  ${result} = phi i1 ${phiParts.join(", ")}`);

    return result;
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

      if (layout.has("stack_frames")) {
        const idx = layout.get("stack_frames");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8** null, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("stack_depth")) {
        const idx = layout.get("stack_depth");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i32 0, ${idx}`,
        );
        currentStruct = nextStruct;
      }
    } else {
      // Fallback if layout missing (should not happen)
      // Assuming manually updated struct layout: { message, code, stack_frames, stack_depth }
      // message (0), code (1), stack_frames (2), stack_depth (3)
      const s = this.newRegister();
      this.emit(
        `  ${s} = insertvalue %struct.DivisionByZeroError undef, i8* ${msgPtr}, 0`,
      );
      const s2 = this.newRegister();
      this.emit(
        `  ${s2} = insertvalue %struct.DivisionByZeroError ${s}, i32 8, 1`,
      );
      const s3 = this.newRegister();
      this.emit(
        `  ${s3} = insertvalue %struct.DivisionByZeroError ${s2}, i8** null, 2`,
      );
      const s4 = this.newRegister();
      this.emit(
        `  ${s4} = insertvalue %struct.DivisionByZeroError ${s3}, i32 0, 3`,
      );
      currentStruct = s4;
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

    if (fieldType.startsWith("{") && !fieldType.endsWith("*")) {
      return this.generateGenericStructEquality(
        leftField,
        rightField,
        fieldType,
        true,
      );
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

  protected getCurrentLabel(): string {
    // Find the last emitted label by scanning backwards
    for (let i = this.output.length - 1; i >= 0; i--) {
      const line = this.output[i]!.trim();
      if (line.endsWith(":") && !line.includes(" ")) {
        return line.slice(0, -1); // Remove the ':'
      }
    }
    return "entry"; // fallback
  }
}
