/**
 * Handles address generation, pointer operations, and null checks.
 *
 * Generates code for:
 * - Address-of operator (`&expr`)
 * - Pointer dereference operations
 * - Array/slice element addressing
 * - Struct field addressing
 * - Index expressions with bounds checking
 *
 * @extends ReflectionGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { CompilerError, type SourceLocation } from "../../common/CompilerError";
import { TokenType } from "../../frontend/TokenType";
import { ReflectionGenerator } from "./ReflectionGenerator";
import { getIntegerBitWidth } from "./utils";

export abstract class AddressExpressionGenerator extends ReflectionGenerator {
  protected abstract generateBlock(block: AST.BlockStmt): void;
  protected abstract generateExpression(expr: AST.Expression): string;
  protected abstract generateArrayLiteral(expr: AST.ArrayLiteralExpr): string;

  /**
   * Generate address of an expression (lvalue)
   */
  protected generateAddress(
    expr: AST.Expression,
    skipNullObjectCheck: boolean = false,
  ): string {
    if (expr.kind === "Identifier") {
      return this.generateIdentifierAddress(expr as AST.IdentifierExpr);
    }
    if (expr.kind === "Member") {
      return this.generateMemberAddress(
        expr as AST.MemberExpr,
        skipNullObjectCheck,
      );
    }
    if (expr.kind === "Group") {
      return this.generateAddress(
        (expr as AST.GroupExpr).expression,
        skipNullObjectCheck,
      );
    }
    if (expr.kind === "Index") {
      return this.generateIndexAddress(
        expr as AST.IndexExpr,
        skipNullObjectCheck,
      );
    }
    if (expr.kind === "Call") {
      return this.generateCallAddress(expr as AST.CallExpr);
    }
    if (expr.kind === "ArrayLiteral") {
      return this.generateArrayLiteralAddress(expr as AST.ArrayLiteralExpr);
    }
    if (expr.kind === "Unary") {
      return this.generateUnaryAddress(expr as AST.UnaryExpr);
    }
    if (expr.kind === "Assignment") {
      // For assignment chaining, generate the assignment and return the address of the assignee
      this.generateExpression(expr);
      return this.generateAddress(
        (expr as AST.AssignmentExpr).assignee,
        skipNullObjectCheck,
      );
    }

    throw new CompilerError(
      `Expression is not an lvalue: ${expr.kind}`,
      "This expression cannot be assigned to or have its address taken.",
      expr.location,
    );
  }

  private generateIdentifierAddress(expr: AST.IdentifierExpr): string {
    const name = expr.name;
    if (this.locals.has(name)) {
      const ptr = this.localPointers.get(name);
      if (ptr) return ptr;
      return `%${name}_ptr`;
    }
    if (this.globals.has(name)) {
      return `@${name}`;
    }

    // Check if it is an imported global variable
    if (
      expr.resolvedDeclaration &&
      expr.resolvedDeclaration.kind === "VariableDecl"
    ) {
      const decl = expr.resolvedDeclaration as AST.VariableDecl;
      if (decl.isGlobal) {
        const type = this.resolveType(
          decl.typeAnnotation ?? decl.resolvedType!,
        );
        const keyword = decl.isConst ? "constant" : "global";
        this.emitDeclaration(`@${name} = external ${keyword} ${type}`);
        this.globals.add(name);
        return `@${name}`;
      }
    }

    const ptr = this.localPointers.get(name);
    if (ptr) return ptr;

    if (expr.resolvedType && expr.resolvedType.kind === "FunctionType") {
      // Function identifiers are r-values (structs), so to take their address we must spill to stack
      const val = this.generateExpression(expr);
      const type = this.resolveType(expr.resolvedType);
      const spill = this.allocateStack(`func_spill_${this.labelCount++}`, type);
      this.emit(`  store ${type} ${val}, ${type}* ${spill}`);
      return spill;
    }

    return `%${name}_ptr`;
  }

  private generateMemberAddress(
    memberExpr: AST.MemberExpr,
    skipNullObjectCheck: boolean,
  ): string {
    const objType = memberExpr.object.resolvedType;

    // Check for module access (ModuleType is an internal type not in the union)
    if (
      objType &&
      (objType as unknown as { kind: string }).kind === "ModuleType"
    ) {
      return `@${memberExpr.property}`;
    }

    const objectAddr = this.generateAddress(
      memberExpr.object,
      skipNullObjectCheck,
    );

    if (!objType || objType.kind !== "BasicType") {
      throw new CompilerError(
        "Member access on non-struct type",
        "Member access (.) is allowed only on struct types",
        memberExpr.location,
      );
    }

    const llvmType = this.resolveType(objType);

    // Force generation of struct layout if it's a pointer
    if (objType.pointerDepth > 0) {
      const underlying = { ...objType, pointerDepth: 0 };
      this.resolveType(underlying);
    }

    let structName = objType.name;
    if (llvmType.startsWith("%struct.")) {
      structName = llvmType.substring(8);
      while (structName.endsWith("*")) structName = structName.slice(0, -1);
    }

    let layout = this.structLayouts.get(structName);
    if (!layout && structName.includes(".")) {
      const shortName = structName.split(".").pop()!;
      layout = this.structLayouts.get(shortName);
    }
    if (!layout) {
      throw new CompilerError(
        `Unknown struct type: ${structName}`,
        "",
        memberExpr.location,
      );
    }

    const fieldIndex = layout.get(memberExpr.property);
    if (fieldIndex === undefined) {
      throw new CompilerError(
        `Unknown field '${memberExpr.property}' in struct '${structName}'`,
        "Available fields: " + Array.from(layout.keys()).join(", "),
        memberExpr.location,
      );
    }

    let baseAddr = objectAddr;
    if (memberExpr.object.kind === "Call") {
      const objLlvmType = this.resolveType(objType);
      if (objLlvmType.endsWith("*")) {
        baseAddr = objectAddr;
      }
    } else if (objType.pointerDepth > 0) {
      const ptrType = llvmType;
      if (memberExpr.object.kind === "Identifier") {
        const identifier = memberExpr.object as AST.IdentifierExpr;
        const declaredType = this.localTypes.get(identifier.name);
        const declaredLlvmType = declaredType
          ? this.resolveType(declaredType)
          : ptrType;

        if (
          declaredLlvmType !== ptrType &&
          declaredLlvmType.endsWith("*") &&
          ptrType.endsWith("*")
        ) {
          baseAddr = this.generateExpression(memberExpr.object);
        } else {
          const ptrReg = this.newRegister();
          this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);
          baseAddr = ptrReg;
        }
      } else {
        const ptrReg = this.newRegister();
        this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);
        baseAddr = ptrReg;
      }
    }

    // Runtime null check for pointer dereference
    if (objType.pointerDepth > 0 && !skipNullObjectCheck) {
      this.emitNullPointerCheck(
        baseAddr,
        llvmType,
        memberExpr.location,
        this.exprToDescription(memberExpr),
        "Attempted to access member of nullptr",
      );
    }

    const structBase = `%struct.${structName}`;
    const addr = this.newRegister();
    this.emit(
      `  ${addr} = getelementptr inbounds ${structBase}, ${structBase}* ${baseAddr}, i32 0, i32 ${fieldIndex}`,
    );
    return addr;
  }

  private generateIndexAddress(
    indexExpr: AST.IndexExpr,
    skipNullObjectCheck: boolean,
  ): string {
    const objectAddr = this.generateAddress(
      indexExpr.object,
      skipNullObjectCheck,
    );
    const indexValRaw = this.generateExpression(indexExpr.index);

    // Cast index to i64 if needed
    const indexType = this.resolveType(indexExpr.index.resolvedType!);
    let indexVal = indexValRaw;
    if (indexType !== "i64") {
      const castReg = this.newRegister();
      if (this.isSigned(indexExpr.index.resolvedType!)) {
        this.emit(`  ${castReg} = sext ${indexType} ${indexValRaw} to i64`);
      } else {
        this.emit(`  ${castReg} = zext ${indexType} ${indexValRaw} to i64`);
      }
      indexVal = castReg;
    }

    const objType = indexExpr.object.resolvedType;
    if (!objType) {
      throw new CompilerError(
        "Indexing undefined type",
        "",
        indexExpr.location,
      );
    }

    const hasArrayDims =
      "arrayDimensions" in objType &&
      objType.arrayDimensions &&
      objType.arrayDimensions.length > 0;

    if (!hasArrayDims && objType.kind !== "BasicType") {
      throw new CompilerError(
        "Indexing non-basic type",
        "",
        indexExpr.location,
      );
    }

    let addr: string;
    const isPointer = objType.kind === "BasicType" && objType.pointerDepth > 0;

    // Determine if this is truly a pointer-to-array or just an array-of-pointers
    // - Array of pointers like [2 x i32*]: pointerDepth=1, arrayDimensions=[2], LLVM=[2 x i32*]
    // - Pointer to array like [2 x i32]*: pointerDepth=1, arrayDimensions=[2], LLVM=[2 x i32]*
    // The difference is: pointer-to-array LLVM type ends with ]*

    const llvmType = isPointer ? this.resolveType(objType) : null;
    const pointerToArray = isPointer && llvmType && llvmType.endsWith("]*");

    if (this.isSliceTypeNode(objType)) {
      addr = this.generateSliceIndexAddress(
        indexExpr,
        objectAddr,
        indexVal,
        objType,
      );
    } else if (isPointer && !pointerToArray) {
      // True single-level pointer (could be pointer to element or array of pointers)
      // This includes both:
      // - Regular pointers: int* -> direct GEP
      // - Array of pointers: [2 x i32*] -> GEP on array stored locally
      // We'll handle both in generatePointerIndexAddress or generateArrayIndexAddress

      if (hasArrayDims) {
        // Array of pointers - treat as array (no load needed)
        addr = this.generateArrayIndexAddress(
          indexExpr,
          objectAddr,
          indexVal,
          objType,
        );
      } else {
        // Regular pointer - load and GEP
        addr = this.generatePointerIndexAddress(
          indexExpr,
          objectAddr,
          indexVal,
          objType,
          skipNullObjectCheck,
        );
      }
    } else if (pointerToArray) {
      // True pointer-to-array case
      addr = this.generatePointerToArrayIndexAddress(
        indexExpr,
        objectAddr,
        indexVal,
        objType,
        skipNullObjectCheck,
      );
    } else if (hasArrayDims) {
      // Array case (no pointer)
      addr = this.generateArrayIndexAddress(
        indexExpr,
        objectAddr,
        indexVal,
        objType,
      );
    } else {
      throw new CompilerError(
        "Indexing non-array/non-pointer",
        "Only arrays and pointers can be indexed.",
        indexExpr.location,
      );
    }

    // Runtime null-object guard for struct locals being indexed
    if (
      objType.kind === "BasicType" &&
      objType.pointerDepth === 0 &&
      indexExpr.object.kind === "Identifier" &&
      !skipNullObjectCheck
    ) {
      this.checkLocalNullFlag(indexExpr);
    }

    return addr;
  }

  private generateArrayIndexAddress(
    indexExpr: AST.IndexExpr,
    objectAddr: string,
    indexVal: string,
    objType: AST.TypeNode,
  ): string {
    const llvmType = this.resolveType(objType);

    // Bounds check for fixed-size arrays
    if (llvmType.startsWith("[")) {
      const match = llvmType.match(/^\[(\d+) x/);
      if (match) {
        const size = parseInt(match[1]!);
        this.emitBoundsCheck(indexVal, size, indexExpr.location);
      }
    }

    const addr = this.newRegister();
    if (llvmType.startsWith("[")) {
      this.emit(
        `  ${addr} = getelementptr inbounds ${llvmType}, ${llvmType}* ${objectAddr}, i64 0, i64 ${indexVal}`,
      );
    } else {
      this.emit(
        `  ${addr} = getelementptr inbounds ${llvmType}, ${llvmType}* ${objectAddr}, i64 ${indexVal}`,
      );
    }
    return addr;
  }

  private generateSliceIndexAddress(
    indexExpr: AST.IndexExpr,
    objectAddr: string,
    indexVal: string,
    objType: AST.BasicTypeNode,
  ): string {
    const sliceType = this.resolveType(objType);
    const elementType = this.resolveType(this.getArrayElementTypeNode(objType));

    const sliceVal = this.newRegister();
    this.emit(`  ${sliceVal} = load ${sliceType}, ${sliceType}* ${objectAddr}`);

    const dataPtr = this.newRegister();
    this.emit(`  ${dataPtr} = extractvalue ${sliceType} ${sliceVal}, 0`);

    const length = this.newRegister();
    this.emit(`  ${length} = extractvalue ${sliceType} ${sliceVal}, 1`);

    this.emitDynamicBoundsCheck(indexVal, length, indexExpr.location);

    const addr = this.newRegister();
    this.emit(
      `  ${addr} = getelementptr inbounds ${elementType}, ${elementType}* ${dataPtr}, i64 ${indexVal}`,
    );
    return addr;
  }

  private generatePointerIndexAddress(
    indexExpr: AST.IndexExpr,
    objectAddr: string,
    indexVal: string,
    objType: AST.BasicTypeNode,
    skipNullObjectCheck: boolean,
  ): string {
    const ptrReg = this.newRegister();
    const ptrType = this.resolveType(objType);
    this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);

    if (!skipNullObjectCheck) {
      this.emitNullPointerCheck(
        ptrReg,
        ptrType,
        indexExpr.location,
        this.exprToDescription(indexExpr),
        "Attempted to index null pointer",
      );
    }

    const elemType = this.resolveType(indexExpr.resolvedType!);
    const addr = this.newRegister();
    this.emit(
      `  ${addr} = getelementptr inbounds ${elemType}, ${ptrType} ${ptrReg}, i64 ${indexVal}`,
    );
    return addr;
  }

  private generatePointerToArrayIndexAddress(
    indexExpr: AST.IndexExpr,
    objectAddr: string,
    indexVal: string,
    objType: AST.BasicTypeNode,
    skipNullObjectCheck: boolean,
  ): string {
    // For pointer-to-array like [10 x i32]*
    // Load the pointer, then GEP with 0 and the index
    const ptrReg = this.newRegister();
    const ptrType = this.resolveType(objType);
    this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);

    if (!skipNullObjectCheck) {
      this.emitNullPointerCheck(
        ptrReg,
        ptrType,
        indexExpr.location,
        this.exprToDescription(indexExpr),
        "Attempted to index null pointer",
      );
    }

    // Get the underlying array type (remove the trailing *)
    const arrayType = ptrType.slice(0, -1); // Remove trailing *
    const _elemType = this.resolveType(indexExpr.resolvedType!);
    const addr = this.newRegister();
    // GEP with 0 to dereference the pointer, then index into the array
    this.emit(
      `  ${addr} = getelementptr inbounds ${arrayType}, ${ptrType} ${ptrReg}, i64 0, i64 ${indexVal}`,
    );
    return addr;
  }

  private generateCallAddress(expr: AST.CallExpr): string {
    if (expr.resolvedType) {
      const llvmType = this.resolveType(expr.resolvedType);
      if (llvmType.endsWith("*")) {
        return this.generateExpression(expr);
      }
    }
    throw new CompilerError(
      "Expression is not an lvalue: Call",
      "Function calls return rvalues and cannot be assigned to or have their address taken.",
      expr.location,
    );
  }

  private generateArrayLiteralAddress(expr: AST.ArrayLiteralExpr): string {
    const type = this.resolveType(expr.resolvedType!);
    const ptr = this.allocateStack(`array_lit_${this.labelCount++}`, type);
    const val = this.generateArrayLiteral(expr);
    this.emit(`  store ${type} ${val}, ${type}* ${ptr}`);
    return ptr;
  }

  private generateUnaryAddress(expr: AST.UnaryExpr): string {
    if (expr.operator.type === TokenType.Star) {
      return this.generateExpression(expr.operand);
    }
    throw new CompilerError(
      "Address of non-lvalue unary expression",
      "This unary expression does not yield an lvalue.",
      expr.location,
    );
  }

  private checkLocalNullFlag(indexExpr: AST.IndexExpr): void {
    const idName = (indexExpr.object as AST.IdentifierExpr).name;
    const flagPtr = this.localNullFlags.get(idName);
    if (!flagPtr) return;

    const flagVal = this.newRegister();
    this.emit(`  ${flagVal} = load i1, i1* ${flagPtr}`);

    const negFlag = this.newRegister();
    this.emit(`  ${negFlag} = xor i1 ${flagVal}, 1`);

    const funcName = this.currentFunctionName || "unknown";
    const exprStr = `${idName}[...]`;
    const msg = "Attempted to access index of null object";

    this.registerStringLiteral(msg);
    this.registerStringLiteral(funcName);
    this.registerStringLiteral(exprStr);

    const throwLabel = this.newLabel("nullobj.throw");
    const passLabel = this.newLabel("nullobj.pass");
    this.emit(`  br i1 ${negFlag}, label %${throwLabel}, label %${passLabel}`);

    this.emit(`${throwLabel}:`);
    const errorStruct = this.buildNullAccessError(
      msg,
      funcName,
      exprStr,
      indexExpr.location,
    );
    this.emitThrow(errorStruct, "%struct.NullAccessError");

    this.emit(`${passLabel}:`);
  }

  /**
   * Register a string literal for later emission
   */
  private registerStringLiteral(content: string): void {
    if (!this.stringLiterals.has(content)) {
      this.stringLiterals.set(content, `@.str.${this.stringLiterals.size}`);
    }
  }

  protected exprToDescription(expr: AST.Expression): string {
    if (!expr) return "unknown_expression";

    switch (expr.kind) {
      case "Identifier":
        return (expr as AST.IdentifierExpr).name;
      case "Member": {
        const member = expr as AST.MemberExpr;
        return `${this.exprToDescription(member.object)}.${member.property}`;
      }
      case "Index": {
        const idx = expr as AST.IndexExpr;
        return `${this.exprToDescription(idx.object)}[...]`;
      }
      case "Call": {
        const call = expr as AST.CallExpr;
        if (call.callee.kind === "Identifier") {
          return `${(call.callee as AST.IdentifierExpr).name}(...)`;
        }
        return "call(...)";
      }
      case "Unary": {
        const unary = expr as AST.UnaryExpr;
        return `${unary.operator}${this.exprToDescription(unary.operand)}`;
      }
      default:
        // Use location if available
        if (expr.location) {
          const col = expr.location.startColumn ?? 0;
          return `<line:${expr.location.startLine}:${col}>`;
        }
        return "expression";
    }
  }

  /**
   * Emit null pointer check with throw
   */
  protected emitNullPointerCheck(
    ptrVal: string,
    ptrType: string,
    location: SourceLocation,
    exprStr: string,
    _msg: string,
  ): void {
    const ptrAsI8 = this.newRegister();
    this.emit(`  ${ptrAsI8} = bitcast ${ptrType} ${ptrVal} to i8*`);
    // For optimization levels >= 2, we skip the runtime call for performance
    if (this.optimizationLevel < 2) {
      const funcNameStr = this.currentFunctionName || "unknown";
      const funcNamePtr = this.getStringLiteralPtr(funcNameStr);
      const exprStrPtr = this.getStringLiteralPtr(exprStr);
      const line = location.startLine;
      const col = location.startColumn || 0;
      this.emit(
        `  call void @__bpl_check_null(i8* ${ptrAsI8}, i8* ${funcNamePtr}, i8* ${exprStrPtr}, i32 ${line}, i32 ${col})`,
      );
    }
  }

  /**
   * Emit bounds check with throw
   */
  protected emitBoundsCheck(
    indexVal: string,
    size: number,
    location: SourceLocation,
  ): void {
    if (this.optimizationLevel >= 3) {
      return;
    }

    const inBounds = this.newRegister();
    this.emit(`  ${inBounds} = icmp ult i64 ${indexVal}, ${size}`);

    const throwLabel = this.newLabel("bounds.throw");
    const passLabel = this.newLabel("bounds.pass");
    this.emit(`  br i1 ${inBounds}, label %${passLabel}, label %${throwLabel}`);

    this.emit(`${throwLabel}:`);

    const funcNameStr = this.currentFunctionName || "unknown";
    const funcNamePtr = this.getStringLiteralPtr(funcNameStr);
    const line = location.startLine;
    const col = location.startColumn || 0;

    const idx32 = this.newRegister();
    this.emit(`  ${idx32} = trunc i64 ${indexVal} to i32`);

    this.emit(
      `  call void @__bpl_throw_index_out_of_bounds(i32 ${idx32}, i32 ${size}, i8* ${funcNamePtr}, i32 ${line}, i32 ${col})`,
    );
    this.emit(`  unreachable`);

    this.emit(`${passLabel}:`);
  }

  protected emitDynamicBoundsCheck(
    indexVal: string,
    sizeVal: string,
    location: SourceLocation,
  ): void {
    if (this.optimizationLevel >= 3) {
      return;
    }

    const inBounds = this.newRegister();
    this.emit(`  ${inBounds} = icmp ult i64 ${indexVal}, ${sizeVal}`);

    const throwLabel = this.newLabel("bounds.throw");
    const passLabel = this.newLabel("bounds.pass");
    this.emit(`  br i1 ${inBounds}, label %${passLabel}, label %${throwLabel}`);

    this.emit(`${throwLabel}:`);

    const funcNameStr = this.currentFunctionName || "unknown";
    const funcNamePtr = this.getStringLiteralPtr(funcNameStr);
    const line = location.startLine;
    const col = location.startColumn || 0;

    const idx32 = this.newRegister();
    this.emit(`  ${idx32} = trunc i64 ${indexVal} to i32`);

    const size32 = this.newRegister();
    this.emit(`  ${size32} = trunc i64 ${sizeVal} to i32`);

    this.emit(
      `  call void @__bpl_throw_index_out_of_bounds(i32 ${idx32}, i32 ${size32}, i8* ${funcNamePtr}, i32 ${line}, i32 ${col})`,
    );
    this.emit(`  unreachable`);

    this.emit(`${passLabel}:`);
  }

  /**
   * Build NullAccessError struct value
   */
  private buildNullAccessError(
    msg: string,
    funcName: string,
    exprStr: string,
    location: SourceLocation,
  ): string {
    const msgLen = msg.length + 1;
    const funcLen = funcName.length + 1;
    const exprLen = exprStr.length + 1;

    const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;
    const funcPtr = `getelementptr inbounds ([${funcLen} x i8], [${funcLen} x i8]* ${this.stringLiterals.get(funcName)}, i32 0, i32 0)`;
    const exprPtr = `getelementptr inbounds ([${exprLen} x i8], [${exprLen} x i8]* ${this.stringLiterals.get(exprStr)}, i32 0, i32 0)`;

    const layout = this.structLayouts.get("NullAccessError");
    let currentStruct = "undef";

    if (layout) {
      currentStruct = this.buildErrorStructWithLayout(
        layout,
        "NullAccessError",
        { message: msgPtr, code: "7", function: funcPtr, expression: exprPtr },
        location,
      );
    } else {
      // Fallback
      const s1 = this.newRegister();
      this.emit(
        `  ${s1} = insertvalue %struct.NullAccessError undef, i8* ${msgPtr}, 0`,
      );
      const s2 = this.newRegister();
      this.emit(
        `  ${s2} = insertvalue %struct.NullAccessError ${s1}, i8* ${funcPtr}, 1`,
      );
      const s3 = this.newRegister();
      this.emit(
        `  ${s3} = insertvalue %struct.NullAccessError ${s2}, i8* ${exprPtr}, 2`,
      );
      const s4 = this.newRegister();
      this.emit(
        `  ${s4} = insertvalue %struct.NullAccessError ${s3}, i32 ${location.startLine}, 3`,
      );
      const s5 = this.newRegister();
      this.emit(
        `  ${s5} = insertvalue %struct.NullAccessError ${s4}, i32 ${location.startColumn}, 4`,
      );
      currentStruct = s5;
    }
    return currentStruct;
  }

  /**
   * Build IndexOutOfBoundsError struct value
   */
  private buildIndexOutOfBoundsError(
    indexVal: string,
    size: number,
    _location: SourceLocation,
  ): string {
    const msg = "Index out of bounds";
    const msgLen = msg.length + 1;
    const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;

    const layout = this.structLayouts.get("IndexOutOfBoundsError");
    let currentStruct = "undef";

    if (layout) {
      if (layout.has("__vtable__")) {
        const vtableIndex = layout.get("__vtable__");
        const vtablePtr = this.newRegister();
        this.emit(
          `  ${vtablePtr} = bitcast [3 x i8*]* @IndexOutOfBoundsError_vtable to i8*`,
        );
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("message")) {
        const idx = layout.get("message");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
        );
        currentStruct = nextStruct;
      }
      if (layout.has("code")) {
        const idx = layout.get("code");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 5, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("stack_frames")) {
        const idx = layout.get("stack_frames");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i8** null, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("stack_depth")) {
        const idx = layout.get("stack_depth");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 0, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("index")) {
        const idx = layout.get("index");
        const indexValI32 = this.newRegister();
        this.emit(`  ${indexValI32} = trunc i64 ${indexVal} to i32`);
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 ${indexValI32}, ${idx}`,
        );
        currentStruct = nextStruct;
      }

      if (layout.has("size")) {
        const idx = layout.get("size");
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 ${size}, ${idx}`,
        );
        currentStruct = nextStruct;
      }
    } else {
      const indexValI32 = this.newRegister();
      this.emit(`  ${indexValI32} = trunc i64 ${indexVal} to i32`);
      const s1 = this.newRegister();
      this.emit(
        `  ${s1} = insertvalue %struct.IndexOutOfBoundsError undef, i32 ${indexValI32}, 0`,
      );
      const s2 = this.newRegister();
      this.emit(
        `  ${s2} = insertvalue %struct.IndexOutOfBoundsError ${s1}, i32 ${size}, 1`,
      );
      currentStruct = s2;
    }
    return currentStruct;
  }

  /**
   * Build an error struct using layout information
   */
  private buildErrorStructWithLayout(
    layout: Map<string, number>,
    structName: string,
    fields: Record<string, string>,
    location: SourceLocation,
  ): string {
    let currentStruct = "undef";
    const typeStr = `%struct.${structName}`;

    if (layout.has("__vtable__")) {
      const vtableIndex = layout.get("__vtable__");
      const vtablePtr = this.newRegister();
      this.emit(
        `  ${vtablePtr} = bitcast [3 x i8*]* @${structName}_vtable to i8*`,
      );
      const nextStruct = this.newRegister();
      this.emit(
        `  ${nextStruct} = insertvalue ${typeStr} ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
      );
      currentStruct = nextStruct;
    }

    for (const [fieldName, value] of Object.entries(fields)) {
      if (layout.has(fieldName)) {
        const idx = layout.get(fieldName);
        const nextStruct = this.newRegister();
        const fieldType = fieldName === "code" ? "i32" : "i8*";
        this.emit(
          `  ${nextStruct} = insertvalue ${typeStr} ${currentStruct}, ${fieldType} ${value}, ${idx}`,
        );
        currentStruct = nextStruct;
      }
    }

    if (layout.has("line")) {
      const idx = layout.get("line");
      const nextStruct = this.newRegister();
      this.emit(
        `  ${nextStruct} = insertvalue ${typeStr} ${currentStruct}, i32 ${location.startLine}, ${idx}`,
      );
      currentStruct = nextStruct;
    }
    if (layout.has("column")) {
      const idx = layout.get("column");
      const nextStruct = this.newRegister();
      this.emit(
        `  ${nextStruct} = insertvalue ${typeStr} ${currentStruct}, i32 ${location.startColumn}, ${idx}`,
      );
      currentStruct = nextStruct;
    }

    return currentStruct;
  }

  /**
   * Emit throw for an exception value
   */
  protected emitThrow(value: string, type: string): void {
    const typeId = this.getTypeId(type);
    this.emit(`  store i32 ${typeId}, i32* @exception_type`);

    const valueSize = this.newRegister();
    this.emit(`  ${valueSize} = ptrtoint ${type}* null to i64`);
    const allocSize = this.newRegister();
    this.emit(`  ${allocSize} = add i64 ${valueSize}, 0`);

    const exceptionMem = this.newRegister();
    this.emit(
      `  ${exceptionMem} = call i8* @malloc(i64 ptrtoint (${type}* getelementptr (${type}, ${type}* null, i32 1) to i64))`,
    );
    const exceptionPtr = this.newRegister();
    this.emit(`  ${exceptionPtr} = bitcast i8* ${exceptionMem} to ${type}*`);
    this.emit(`  store ${type} ${value}, ${type}* ${exceptionPtr}`);

    const castVal = this.newRegister();
    this.emit(`  ${castVal} = ptrtoint ${type}* ${exceptionPtr} to i64`);
    this.emit(`  store i64 ${castVal}, i64* @exception_value`);

    const framePtr = this.newRegister();
    this.emit(
      `  ${framePtr} = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top`,
    );

    const isNull = this.newRegister();
    this.emit(
      `  ${isNull} = icmp eq %struct.ExceptionFrame* ${framePtr}, null`,
    );

    const abortLabel = this.newLabel("throw.abort");
    const jumpLabel = this.newLabel("throw.jump");

    this.emit(`  br i1 ${isNull}, label %${abortLabel}, label %${jumpLabel}`);

    this.emit(`${abortLabel}:`);
    this.emit(`  call void @exit(i32 1)`);
    this.emit(`  unreachable`);

    this.emit(`${jumpLabel}:`);

    // Unwind defer stack
    this.emitDeferUnwind(framePtr);

    const bufFieldPtr = this.newRegister();
    this.emit(
      `  ${bufFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 0`,
    );

    const bufVoidPtr = this.newRegister();
    this.emit(`  ${bufVoidPtr} = bitcast [32 x i64]* ${bufFieldPtr} to i8*`);

    this.emit(`  call void @longjmp(i8* ${bufVoidPtr}, i32 1)`);
    this.emit(`  unreachable`);
  }

  /**
   * Emit defer stack unwinding during throw
   */
  private emitDeferUnwind(framePtr: string): void {
    const targetDeferTopPtr = this.newRegister();
    this.emit(
      `  ${targetDeferTopPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 2`,
    );
    const targetDeferTop = this.newRegister();
    this.emit(
      `  ${targetDeferTop} = load %struct.DeferNode*, %struct.DeferNode** ${targetDeferTopPtr}`,
    );

    const unwindCond = this.newLabel("defer.unwind.cond");
    const unwindBody = this.newLabel("defer.unwind.body");
    const unwindEnd = this.newLabel("defer.unwind.end");

    this.emit(`  br label %${unwindCond}`);

    this.emit(`${unwindCond}:`);
    const currentDeferTop = this.newRegister();
    this.emit(
      `  ${currentDeferTop} = load %struct.DeferNode*, %struct.DeferNode** @defer_top`,
    );
    const isDone = this.newRegister();
    this.emit(
      `  ${isDone} = icmp eq %struct.DeferNode* ${currentDeferTop}, ${targetDeferTop}`,
    );
    this.emit(`  br i1 ${isDone}, label %${unwindEnd}, label %${unwindBody}`);

    this.emit(`${unwindBody}:`);
    const funcPtrPtr = this.newRegister();
    this.emit(
      `  ${funcPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDeferTop}, i32 0, i32 0`,
    );
    const funcVoidPtr = this.newRegister();
    this.emit(`  ${funcVoidPtr} = load i8*, i8** ${funcPtrPtr}`);
    const funcPtr = this.newRegister();
    this.emit(`  ${funcPtr} = bitcast i8* ${funcVoidPtr} to void (i8*)*`);

    const ctxPtrPtr = this.newRegister();
    this.emit(
      `  ${ctxPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDeferTop}, i32 0, i32 1`,
    );
    const ctxPtr = this.newRegister();
    this.emit(`  ${ctxPtr} = load i8*, i8** ${ctxPtrPtr}`);

    this.emit(`  call void ${funcPtr}(i8* ${ctxPtr})`);

    const nextPtrPtr = this.newRegister();
    this.emit(
      `  ${nextPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDeferTop}, i32 0, i32 2`,
    );
    const nextPtr = this.newRegister();
    this.emit(
      `  ${nextPtr} = load %struct.DeferNode*, %struct.DeferNode** ${nextPtrPtr}`,
    );
    this.emit(
      `  store %struct.DeferNode* ${nextPtr}, %struct.DeferNode** @defer_top`,
    );

    this.emit(`  call void @free(i8* ${ctxPtr})`);

    const nodeVoidPtr = this.newRegister();
    this.emit(
      `  ${nodeVoidPtr} = bitcast %struct.DeferNode* ${currentDeferTop} to i8*`,
    );
    this.emit(`  call void @free(i8* ${nodeVoidPtr})`);

    this.emit(`  br label %${unwindCond}`);

    this.emit(`${unwindEnd}:`);
  }

  /**
   * Allocate stack space for a local variable
   */
  protected allocateStack(name: string, type: string): string {
    const ptr = `%${name}_ptr.${this.stackAllocCount++}`;
    this.emit(`  ${ptr} = alloca ${type}`);
    this.locals.add(name);
    this.localPointers.set(name, ptr);
    return ptr;
  }

  /**
   * Check if a type is signed
   */
  protected isSigned(type: AST.TypeNode): boolean {
    if (type.kind === "BasicType") {
      return [
        "int",
        "i8",
        "i16",
        "i32",
        "i64",
        "char",
        "short",
        "long",
      ].includes((type as AST.BasicTypeNode).name);
    }
    return false;
  }

  /**
   * Get bit width of integer type
   */
  protected getBitWidth(type: string): number {
    return getIntegerBitWidth(type);
  }

  /**
   * Convert expression to string representation
   */
  protected expressionToString(expr: AST.Expression): string {
    if (expr.kind === "Identifier") {
      return (expr as AST.IdentifierExpr).name;
    }
    if (expr.kind === "Index") {
      const indexExpr = expr as AST.IndexExpr;
      return `${this.expressionToString(indexExpr.object)}[${this.expressionToString(indexExpr.index)}]`;
    }
    if (expr.kind === "Member") {
      const memberExpr = expr as AST.MemberExpr;
      return `${this.expressionToString(memberExpr.object)}.${memberExpr.property}`;
    }
    if (expr.kind === "Literal") {
      const lit = expr as AST.LiteralExpr;
      return String(lit.value);
    }
    return "<expr>";
  }
}
