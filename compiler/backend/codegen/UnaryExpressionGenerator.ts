/**
 * UnaryExpressionGenerator - Handles unary expressions and type casting
 * Part of the ExpressionGenerator inheritance chain
 */
import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { TokenType } from "../../frontend/TokenType";
import { hashString } from "../../common/HashUtils";
import { MatchExpressionGenerator } from "./MatchExpressionGenerator";

export abstract class UnaryExpressionGenerator extends MatchExpressionGenerator {
  protected abstract generateExpression(expr: AST.Expression): string;

  protected generateUnary(expr: AST.UnaryExpr): string {
    // Check for operator overload (only for prefix operators)
    if (expr.operatorOverload && expr.isPrefix) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const operandRaw = this.generateExpression(expr.operand);

      const targetType = overload.targetType as AST.BasicTypeNode;

      // Handle generic struct method calls
      let mangledName: string;
      if (targetType.genericArgs && targetType.genericArgs.length > 0) {
        // Generic struct - need monomorphized method name
        const structDecl = this.structMap.get(targetType.name);
        if (structDecl && structDecl.genericParams.length > 0) {
          // Build context map for generic substitution
          const contextMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < structDecl.genericParams.length; i++) {
            contextMap.set(
              structDecl.genericParams[i]!.name,
              targetType.genericArgs[i]!,
            );
          }

          // Build monomorphized struct name using mangleType (avoids recursion)
          const argNames = targetType.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          const structName = `${targetType.name}_${argNames}`;

          // Build method name
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;

          // Get mangled name with substituted types
          const substitutedMethodType = this.substituteType(
            methodType,
            contextMap,
          ) as AST.FunctionTypeNode;

          mangledName = this.getMangledName(
            fullMethodName,
            substitutedMethodType,
          );
        } else {
          // Fallback: non-generic or already concrete
          const structName = targetType.name;
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;
          mangledName = this.getMangledName(fullMethodName, methodType);
        }
      } else {
        // Non-generic struct
        const structName = targetType.name;
        const methodType = method.resolvedType as AST.FunctionTypeNode;
        const fullMethodName = `${structName}_${method.name}`;
        mangledName = this.getMangledName(fullMethodName, methodType);
      }

      // Get address of operand (this pointer)
      const operandType = this.resolveType(expr.operand.resolvedType!);
      let thisPtr: string;
      try {
        thisPtr = this.generateAddress(expr.operand);
      } catch {
        // If we can't get address, spill to stack
        const spillAddr = this.allocateStack(
          `op_spill_${this.labelCount++}`,
          operandType,
        );
        this.emit(
          `  store ${operandType} ${operandRaw}, ${operandType}* ${spillAddr}`,
        );
        thisPtr = spillAddr;
      }

      // Call the operator method
      const returnType = this.resolveType(method.returnType);
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(${operandType}* ${thisPtr})`,
      );
      return resultReg;
    }

    if (
      expr.operator.type === TokenType.PlusPlus ||
      expr.operator.type === TokenType.MinusMinus
    ) {
      const addr = this.generateAddress(expr.operand);
      const type = this.resolveType(expr.operand.resolvedType!);
      const isFloat = type === "double";
      const one = isFloat ? "1.0" : "1";

      const currentValue = this.newRegister();
      this.emit(`  ${currentValue} = load ${type}, ${type}* ${addr}`);

      let op = "";
      if (expr.operator.type === TokenType.PlusPlus) {
        op = isFloat ? "fadd" : "add";
      } else {
        op = isFloat ? "fsub" : "sub";
      }

      const newValue = this.newRegister();
      this.emit(`  ${newValue} = ${op} ${type} ${currentValue}, ${one}`);
      this.emit(`  store ${type} ${newValue}, ${type}* ${addr}`);

      return expr.isPrefix ? newValue : currentValue;
    }

    if (expr.operator.type === TokenType.Ampersand) {
      return this.generateAddress(expr.operand);
    } else if (expr.operator.type === TokenType.Star) {
      const ptr = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      this.emit(`  ${reg} = load ${type}, ${type}* ${ptr}`);
      return reg;
    } else if (expr.operator.type === TokenType.Minus) {
      const val = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      if (type === "double") {
        this.emit(`  ${reg} = fsub double 0.0, ${val}`);
      } else {
        this.emit(`  ${reg} = sub ${type} 0, ${val}`);
      }
      return reg;
    } else if (expr.operator.type === TokenType.Bang) {
      const val = this.generateExpression(expr.operand);
      const reg = this.newRegister();
      this.emit(`  ${reg} = xor i1 ${val}, true`);
      return reg;
    } else if (expr.operator.type === TokenType.Tilde) {
      const val = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      this.emit(`  ${reg} = xor ${type} ${val}, -1`);
      return reg;
    }
    return "0";
  }

  protected getAllSpecMethods(specDecl: AST.SpecDecl): AST.SpecMethod[] {
    let methods: AST.SpecMethod[] = [];

    if (specDecl.extends) {
      for (const parentType of specDecl.extends) {
        if (parentType.kind === "BasicType") {
          let parentSpec = this.specMap.get(parentType.name);
          if (
            !parentSpec &&
            parentType.resolvedDeclaration &&
            parentType.resolvedDeclaration.kind === "SpecDecl"
          ) {
            parentSpec = parentType.resolvedDeclaration as AST.SpecDecl;
          }
          if (parentSpec) {
            methods = methods.concat(this.getAllSpecMethods(parentSpec));
          }
        }
      }
    }

    methods = methods.concat(specDecl.methods);
    return methods;
  }

  protected getOrGenerateSpecVTable(
    structType: AST.BasicTypeNode,
    specType: AST.BasicTypeNode,
  ): string {
    // Resolve struct name (handling generics)
    let structName = structType.name;
    let structDecl = this.structMap.get(structName);

    if (!structDecl && structType.resolvedDeclaration) {
      structDecl = structType.resolvedDeclaration as AST.StructDecl;
      structName = structDecl.name;
    }

    if (!structDecl) {
      throw new Error(`Cannot find struct declaration for ${structName}`);
    }

    // Resolve spec name
    let specName = specType.name;
    let specDecl = this.specMap.get(specName);

    if (!specDecl && specType.resolvedDeclaration) {
      specDecl = specType.resolvedDeclaration as AST.SpecDecl;
      specName = specDecl.name;
    }

    if (!specDecl) {
      throw new Error(`Cannot find spec declaration for ${specName}`);
    }

    // Construct unique vtable name including generic args
    let vtableName = `__vtable_${structName}`;
    if (structType.genericArgs.length > 0) {
      const args = structType.genericArgs
        .map((a) => this.resolveType(a))
        .join("_")
        .replace(/[^a-zA-Z0-9_]/g, "_");
      vtableName += `_${args}`;
    }
    vtableName += `_${specName}`;
    if (specType.genericArgs.length > 0) {
      const args = specType.genericArgs
        .map((a) => this.resolveType(a))
        .join("_")
        .replace(/[^a-zA-Z0-9_]/g, "_");
      vtableName += `_${args}`;
    }

    if (this.generatedStructs.has(vtableName)) {
      return vtableName;
    }

    // Create type map for substitution
    const typeMap = new Map<string, AST.TypeNode>();
    if (structDecl.genericParams) {
      for (let i = 0; i < structDecl.genericParams.length; i++) {
        if (i < structType.genericArgs.length) {
          typeMap.set(
            structDecl.genericParams[i]!.name,
            structType.genericArgs[i]!,
          );
        }
      }
    }
    // Spec generics are handled via structType.genericArgs above

    // Calculate struct mangled name for method lookup
    let structMangledName = structName;
    if (structType.genericArgs.length > 0) {
      const args = structType.genericArgs
        .map((a) => this.mangleType(a))
        .join("_");
      structMangledName = `${structName}_${args}`;
    }

    const entries: string[] = [];
    const allMethods = this.getAllSpecMethods(specDecl);

    for (const method of allMethods) {
      const implMethod = structDecl.members.find(
        (m) => m.kind === "FunctionDecl" && m.name === method.name,
      ) as AST.FunctionDecl;

      if (!implMethod) {
        throw new Error(
          `Struct ${structName} does not implement method ${method.name} of spec ${specName}`,
        );
      }

      const thunkName = `__thunk_${vtableName}_${method.name}`;

      // Resolve implementation function type with substitutions
      let funcType = implMethod.resolvedType as AST.FunctionTypeNode;
      if (typeMap.size > 0) {
        funcType = this.substituteType(
          funcType,
          typeMap,
        ) as AST.FunctionTypeNode;
      }

      const retType = this.resolveType(funcType.returnType);
      const paramTypes = funcType.paramTypes
        .slice(1)
        .map((t) => this.resolveType(t));
      const paramNames = paramTypes.map((_, i) => `%p${i}`);
      const paramsStr = [
        "i8* %this_void",
        ...paramTypes.map((t, i) => `${t} ${paramNames[i]}`),
      ].join(", ");

      const thunkBody: string[] = [];
      thunkBody.push(
        `define linkonce_odr ${retType} @${thunkName}(${paramsStr}) {`,
      );
      thunkBody.push(`entry:`);

      // Cast this
      // We need the struct type string (e.g. %struct.MyStruct or %struct.MyStruct_i32)
      // We can use resolveType on the substituted first param
      const firstParamType = this.resolveType(funcType.paramTypes[0]!);
      // firstParamType is like %struct.MyStruct or %struct.MyStruct*

      let structTypeStr = firstParamType;
      if (structTypeStr.endsWith("*")) {
        structTypeStr = structTypeStr.slice(0, -1);
      }

      thunkBody.push(
        `  %this_ptr = bitcast i8* %this_void to ${structTypeStr}*`,
      );

      let thisArg = "%this_ptr";
      if (!firstParamType.endsWith("*")) {
        // By value
        thunkBody.push(
          `  %this_val = load ${structTypeStr}, ${structTypeStr}* %this_ptr`,
        );
        thisArg = "%this_val";
      }

      // Get mangled name of implementation
      // We already substituted funcType.
      const methodName = `${structMangledName}_${implMethod.name}`;
      const implName = this.getMangledName(methodName, funcType, false, []);

      const _args = [thisArg, ...paramNames].join(", ");
      const argTypes = [firstParamType, ...paramTypes];
      const typedArgs = argTypes
        .map((t, i) => `${t} ${i === 0 ? thisArg : paramNames[i - 1]}`)
        .join(", ");

      if (retType === "void") {
        thunkBody.push(`  call void @${implName}(${typedArgs})`);
        thunkBody.push(`  ret void`);
      } else {
        thunkBody.push(`  %ret = call ${retType} @${implName}(${typedArgs})`);
        thunkBody.push(`  ret ${retType} %ret`);
      }
      thunkBody.push(`}`);

      this.declarationsOutput.push(thunkBody.join("\n"));

      // Add to entries
      const paramTypesStr =
        paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
      const thunkSig = `${retType} (i8*${paramTypesStr})`;
      entries.push(`i8* bitcast (${thunkSig}* @${thunkName} to i8*)`);
    }

    // Emit VTable
    const arrayType = `[${entries.length} x i8*]`;
    const arrayContent = `[${entries.join(", ")}]`;
    this.declarationsOutput.push(
      `@${vtableName} = linkonce_odr constant ${arrayType} ${arrayContent}`,
    );
    this.generatedStructs.add(vtableName);

    return vtableName;
  }

  protected generateCast(expr: AST.CastExpr): string {
    const val = this.generateExpression(expr.expression);
    const srcType = this.resolveType(expr.expression.resolvedType!);
    const destType = this.resolveType(expr.targetType);
    return this.emitCast(
      val,
      srcType,
      destType,
      expr.expression.resolvedType!,
      expr.targetType,
    );
  }

  protected generateAnyConstruction(
    val: string,
    srcType: string,
    srcTypeNode: AST.TypeNode,
  ): string {
    // Ensure Any struct is defined
    if (!this.generatedStructs.has("Any")) {
      // struct Any { type_info: *TypeInfo, data: u64 }
      // %struct.TypeInfo must be defined by ReflectionGenerator or lib
      this.declarationsOutput.push(
        `%struct.Any = type { %struct.TypeInfo*, i64 }`,
      );
      this.generatedStructs.add("Any");
    }

    const anyType = `%struct.Any`;
    // Use ReflectionGenerator to get the TypeInfo global
    const typeInfoGlobal = this.getOrCreateTypeInfo(srcTypeNode);

    // Pack data
    let dataVal = "0";
    if (srcType.startsWith("%struct.") && !srcType.endsWith("*")) {
      // Struct value passed to Any -> spill to stack and store pointer
      const spill = this.allocateStack(
        `any_spill_${this.labelCount++}`,
        srcType,
      );
      this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);

      const cast = this.newRegister();
      this.emit(`  ${cast} = ptrtoint ${srcType}* ${spill} to i64`);
      dataVal = cast;
    } else if (
      srcType === "i64" ||
      srcType === "u64" ||
      srcType === "double" ||
      srcType.endsWith("*") ||
      srcType === "ptr"
    ) {
      if (srcType === "double") {
        const cast = this.newRegister();
        this.emit(`  ${cast} = bitcast double ${val} to i64`);
        dataVal = cast;
      } else if (srcType.endsWith("*") || srcType === "ptr") {
        const cast = this.newRegister();
        this.emit(`  ${cast} = ptrtoint ${srcType} ${val} to i64`);
        dataVal = cast;
      } else {
        dataVal = val;
      }
    } else {
      // Extend to 64-bit
      const cast = this.newRegister();
      if (srcType === "float") {
        const i32val = this.newRegister();
        this.emit(`  ${i32val} = bitcast float ${val} to i32`);
        this.emit(`  ${cast} = zext i32 ${i32val} to i64`);
      } else {
        // Integer types
        this.emit(`  ${cast} = zext ${srcType} ${val} to i64`);
      }
      dataVal = cast;
    }

    const anyVal = this.newRegister();
    this.emit(
      `  ${anyVal} = insertvalue ${anyType} undef, %struct.TypeInfo* ${typeInfoGlobal}, 0`,
    );
    const finalAny = this.newRegister();
    this.emit(
      `  ${finalAny} = insertvalue ${anyType} ${anyVal}, i64 ${dataVal}, 1`,
    );

    return finalAny;
  }

  protected emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string {
    let effectiveDest = destTypeNode;

    // Resolve Type Alias for destination
    while (
      effectiveDest.kind === "BasicType" &&
      effectiveDest.resolvedDeclaration &&
      effectiveDest.resolvedDeclaration.kind === "TypeAlias"
    ) {
      effectiveDest = (effectiveDest.resolvedDeclaration as AST.TypeAliasDecl)
        .type;
    }

    if (srcTypeNode.kind === "FunctionType") {
      // debug log removed
    }

    // Function (Raw Pointer) to Lambda (Fat Pointer)
    if (
      srcTypeNode.kind === "FunctionType" &&
      effectiveDest.kind === "LambdaType"
    ) {
      const srcFuncType = srcTypeNode as AST.FunctionTypeNode;

      // We need to create a thunk that matches the Lambda signature
      // but calls the raw function pointer stored in the context.

      const retType = this.resolveType(srcFuncType.returnType);
      const paramTypes = srcFuncType.paramTypes.map((p) => this.resolveType(p));
      const paramTypesStr = paramTypes.join(", ");

      // Signature for the thunk: (i8* ctx, params...)
      const thunkParamsStr = ["i8*", ...paramTypes].join(", ");
      const thunkSig = `${retType} (${thunkParamsStr})`;
      const rawFuncSig = `${retType} (${paramTypesStr})`;
      const rawFuncPtrType = `${rawFuncSig}*`;

      // Unique name for the thunk based on signature
      const sigHash = hashString(rawFuncPtrType);
      const thunkName = `__bpl_thunk_${sigHash}`;

      this.requestThunk(thunkName, retType, paramTypes, rawFuncPtrType);
      const thunkRef = `@${thunkName}`;

      // Logic for the cast itself:
      // 1. Cast the raw function pointer (src) to i8* -> this becomes the context.
      const funcPtrAsCtx = this.newRegister();
      this.emit(`  ${funcPtrAsCtx} = bitcast ${srcType} ${val} to i8*`);

      // 2. The lambda function pointer is the Thunk.
      const thunkPtr = this.newRegister();
      // The thunk has signature `ret (i8*, params...)`.
      // The Lambda expects `ret (i8*, params...)*`. Matches.
      this.emit(
        `  ${thunkPtr} = bitcast ${thunkSig}* ${thunkRef} to ${retType} (i8*, ${paramTypesStr})*`,
      );

      // 3. Construct fat pointer { thunk, ctx }
      const fatPtr1 = this.newRegister();
      this.emit(
        `  ${fatPtr1} = insertvalue ${destType} undef, ${retType} (i8*, ${paramTypesStr})* ${thunkPtr}, 0`,
      );

      const fatPtr2 = this.newRegister();
      this.emit(
        `  ${fatPtr2} = insertvalue ${destType} ${fatPtr1}, i8* ${funcPtrAsCtx}, 1`,
      );

      return fatPtr2;
    }

    if (srcType === destType) return val;

    // Function (Raw Pointer) to Lambda (Fat Pointer)
    if (
      srcTypeNode.kind === "FunctionType" &&
      destTypeNode.kind === "LambdaType"
    ) {
      const srcFuncType = srcTypeNode as AST.FunctionTypeNode;

      // We need to create a thunk that matches the Lambda signature
      // but calls the raw function pointer stored in the context.

      const retType = this.resolveType(srcFuncType.returnType);
      const paramTypes = srcFuncType.paramTypes.map((p) => this.resolveType(p));
      const paramTypesStr = paramTypes.join(", ");

      // Signature for the thunk: (i8* ctx, params...)
      const thunkParamsStr = ["i8*", ...paramTypes].join(", ");
      const thunkSig = `${retType} (${thunkParamsStr})`;
      const rawFuncSig = `${retType} (${paramTypesStr})`;
      const rawFuncPtrType = `${rawFuncSig}*`;

      // Unique name for the thunk based on signature
      // We use a content hash or just a deterministic string
      const sigHash = hashString(rawFuncPtrType);
      const thunkName = `__bpl_thunk_${sigHash}`;

      // Generate thunk adapter if needed.
      // The thunk adapts the raw function pointer signature to the lambda signature
      // (receiving an extra i8* context argument).
      this.requestThunk(thunkName, retType, paramTypes, rawFuncPtrType);

      const thunkRef = `@${thunkName}`;

      /*
      if (!this.context.thunks.has(thunkName)) {
        this.context.thunks.add(thunkName);
      }
      */

      // Logic for the cast itself:
      // 1. Cast the raw function pointer (src) to i8* -> this becomes the context.
      const funcPtrAsCtx = this.newRegister();
      this.emit(`  ${funcPtrAsCtx} = bitcast ${srcType} ${val} to i8*`);

      // 2. The lambda function pointer is the Thunk.
      const thunkPtr = this.newRegister();
      // The thunk has signature `ret (i8*, params...)`.
      // The Lambda expects `ret (i8*, params...)*`. Matches.
      this.emit(
        `  ${thunkPtr} = bitcast ${thunkSig}* ${thunkRef} to ${retType} (i8*, ${paramTypesStr})*`,
      );

      // 3. Construct fat pointer { thunk, ctx }
      const fatPtr1 = this.newRegister();
      this.emit(
        `  ${fatPtr1} = insertvalue ${destType} undef, ${retType} (i8*, ${paramTypesStr})* ${thunkPtr}, 0`,
      );

      const fatPtr2 = this.newRegister();
      this.emit(
        `  ${fatPtr2} = insertvalue ${destType} ${fatPtr1}, i8* ${funcPtrAsCtx}, 1`,
      );

      // Trigger thunk generation (I'll need to implement this mechanism)
      /* this.requestThunk(...); */
      return fatPtr2;
    }

    // Lambda to Func (Forbidden)
    if (
      srcTypeNode.kind === "LambdaType" &&
      destTypeNode.kind === "FunctionType"
    ) {
      throw new CompilerError(
        "Cannot cast Lambda to Func. Lambdas carry state (context) which cannot be represented in a raw function pointer.",
        "",
        srcTypeNode.location,
      );
    }

    // Case: Cast to Any
    if (destType === "%struct.Any") {
      return this.generateAnyConstruction(val, srcType, srcTypeNode);
    }

    // Special: casting literal null to a struct/object value should become zeroinitializer
    // Detect by value literal and destination being a non-pointer struct type
    if (
      val === "null" &&
      destType.startsWith("%struct.") &&
      !destType.endsWith("*")
    ) {
      return "zeroinitializer";
    }

    // Pointer to Pointer cast (bitcast)
    if (srcType.endsWith("*") && destType.endsWith("*")) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Integer to Pointer (inttoptr)
    if (srcType.startsWith("i") && destType.endsWith("*")) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = inttoptr ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Pointer to Integer (ptrtoint)
    if (srcType.endsWith("*") && destType.startsWith("i")) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = ptrtoint ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Implicit address-of (T -> *T)
    if (destType === srcType + "*") {
      const ptr = this.newRegister();
      this.emit(`  ${ptr} = alloca ${srcType}`);
      this.emit(`  store ${srcType} ${val}, ${srcType}* ${ptr}`);
      return ptr;
    }

    // Implicit dereference (*T -> T) - copy
    if (srcType === destType + "*") {
      const reg = this.newRegister();
      this.emit(`  ${reg} = load ${destType}, ${srcType} ${val}`);
      return reg;
    }

    // Struct -> Spec (Fat Pointer Construction)
    if (
      srcTypeNode.kind === "BasicType" &&
      destTypeNode.kind === "BasicType" &&
      destType === "{ i8*, i8* }"
    ) {
      // 1. Get pointer to object
      let objPtr: string;
      if (!srcType.endsWith("*")) {
        const alloca = this.newRegister();
        this.emit(`  ${alloca} = alloca ${srcType}`);
        this.emit(`  store ${srcType} ${val}, ${srcType}* ${alloca}`);
        const castPtr = this.newRegister();
        this.emit(`  ${castPtr} = bitcast ${srcType}* ${alloca} to i8*`);
        objPtr = castPtr;
      } else {
        const castPtr = this.newRegister();
        this.emit(`  ${castPtr} = bitcast ${srcType} ${val} to i8*`);
        objPtr = castPtr;
      }

      // 2. Get VTable pointer
      const vtableName = this.getOrGenerateSpecVTable(
        srcTypeNode as AST.BasicTypeNode,
        destTypeNode as AST.BasicTypeNode,
      );

      const specName = (destTypeNode as AST.BasicTypeNode).name;
      let specDecl = this.specMap.get(specName);
      if (!specDecl && destTypeNode.resolvedDeclaration) {
        specDecl = destTypeNode.resolvedDeclaration as AST.SpecDecl;
      }
      const size = specDecl ? this.getAllSpecMethods(specDecl).length : 0;

      const vtablePtr = this.newRegister();

      this.emit(
        `  ${vtablePtr} = bitcast [${size} x i8*]* @${vtableName} to i8*`,
      );

      // 3. Construct Fat Pointer
      const fatPtr1 = this.newRegister();
      this.emit(
        `  ${fatPtr1} = insertvalue { i8*, i8* } undef, i8* ${objPtr}, 0`,
      );
      const fatPtr2 = this.newRegister();
      this.emit(
        `  ${fatPtr2} = insertvalue { i8*, i8* } ${fatPtr1}, i8* ${vtablePtr}, 1`,
      );

      return fatPtr2;
    }

    // Struct <-> Primitive inheritance casts
    if (
      srcTypeNode.kind === "BasicType" &&
      destTypeNode.kind === "BasicType" &&
      srcTypeNode.pointerDepth === 0 &&
      destTypeNode.pointerDepth === 0
    ) {
      // Case 1: Struct -> Primitive (Unwrap)
      if (srcType.startsWith("%struct.") && !destType.startsWith("%struct.")) {
        // We assume TypeChecker has validated that this is a valid inheritance cast
        // Extract the field corresponding to the primitive base
        const structName = srcTypeNode.name;
        const layout = this.structLayouts.get(structName);
        let baseIdx = 0;
        if (layout && layout.has("__base__")) {
          baseIdx = layout.get("__base__")!;
        }

        const extracted = this.newRegister();
        this.emit(
          `  ${extracted} = extractvalue ${srcType} ${val}, ${baseIdx}`,
        );
        return extracted;
      }

      // Case 2: Primitive -> Struct (Wrap)
      if (!srcType.startsWith("%struct.") && destType.startsWith("%struct.")) {
        // We assume TypeChecker has validated that this is a valid inheritance cast
        // Insert the primitive value into the base field
        const structName = destTypeNode.name;
        const layout = this.structLayouts.get(structName);
        let baseIdx = 0;
        if (layout && layout.has("__base__")) {
          baseIdx = layout.get("__base__")!;
        }

        let structReg = this.newRegister();
        this.emit(
          `  ${structReg} = insertvalue ${destType} undef, ${srcType} ${val}, ${baseIdx}`,
        );

        // Initialize VTable if present
        if (layout && layout.has("__vtable__")) {
          const vtableIdx = layout.get("__vtable__")!;
          const vtablePtr = this.newRegister();
          // We don't know the exact size of the vtable array here easily,
          // but we can bitcast the global directly if we know its name.
          // The global is named @StructName_vtable.
          // We can try to bitcast from [...] to i8*.
          // But we need the type.
          // Alternatively, we can look up the vtable definition if we tracked it.
          // Or we can just assume it's a pointer and we are storing it.

          // For now, let's try to find the vtable size from vtableLayouts
          const vtableEntries = this.vtableLayouts.get(structName);
          const size = vtableEntries ? vtableEntries.length : 0;

          if (size > 0) {
            this.emit(
              `  ${vtablePtr} = bitcast [${size} x i8*]* @${structName}_vtable to i8*`,
            );
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue ${destType} ${structReg}, i8* ${vtablePtr}, ${vtableIdx}`,
            );
            structReg = nextStruct;
          }
        }

        return structReg;
      }
    }

    const reg = this.newRegister();

    // Void pointer compatibility: i8* (void*) <-> any pointer type
    // Allow bidirectional casting between void* and any other pointer
    if (srcType === "i8*" && destType.endsWith("*")) {
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }
    if (srcType.endsWith("*") && destType === "i8*") {
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Struct* -> Spec* (Fat Pointer Construction on Stack)
    if (
      srcTypeNode.kind === "BasicType" &&
      destTypeNode.kind === "BasicType" &&
      (srcTypeNode as AST.BasicTypeNode).pointerDepth > 0 &&
      (destTypeNode as AST.BasicTypeNode).pointerDepth > 0 &&
      destType === "{ i8*, i8* }*"
    ) {
      const srcBasic = srcTypeNode as AST.BasicTypeNode;
      const destBasic = destTypeNode as AST.BasicTypeNode;

      // 1. Get pointer to object (which is just val, since val is Struct*)
      const objPtr = this.newRegister();
      this.emit(`  ${objPtr} = bitcast ${srcType} ${val} to i8*`);

      // 2. Get VTable pointer
      const vtableName = this.getOrGenerateSpecVTable(srcBasic, destBasic);

      const specName = destBasic.name;
      let specDecl = this.specMap.get(specName);
      if (!specDecl && destBasic.resolvedDeclaration) {
        specDecl = destBasic.resolvedDeclaration as AST.SpecDecl;
      }
      const size = specDecl ? this.getAllSpecMethods(specDecl).length : 0;

      const vtablePtr = this.newRegister();
      this.emit(
        `  ${vtablePtr} = bitcast [${size} x i8*]* @${vtableName} to i8*`,
      );

      // 3. Construct Fat Pointer on Stack
      const fatPtrType = "{ i8*, i8* }";
      const fatPtrAlloc = this.allocateStack(
        `fat_ptr_${this.labelCount++}`,
        fatPtrType,
      );

      // Store obj pointer
      const objField = this.newRegister();
      this.emit(
        `  ${objField} = getelementptr inbounds ${fatPtrType}, ${fatPtrType}* ${fatPtrAlloc}, i32 0, i32 0`,
      );
      this.emit(`  store i8* ${objPtr}, i8** ${objField}`);

      // Store vtable pointer
      const vtableField = this.newRegister();
      this.emit(
        `  ${vtableField} = getelementptr inbounds ${fatPtrType}, ${fatPtrType}* ${fatPtrAlloc}, i32 0, i32 1`,
      );
      this.emit(`  store i8* ${vtablePtr}, i8** ${vtableField}`);

      // Return pointer to fat pointer
      return fatPtrAlloc;
    }

    // Float casts
    if (srcType === "double" && destType.startsWith("i")) {
      const isSigned = this.isSigned(destTypeNode);
      const width = this.getBitWidth(destType);

      // Use saturating cast intrinsic to prevent UB on overflow
      const intrinsicOp = isSigned ? "llvm.fptosi.sat" : "llvm.fptoui.sat";
      const intrinsicName = `${intrinsicOp}.i${width}.f64`;

      const decl = `declare ${destType} @${intrinsicName}(double)`;
      if (!this.declarationsOutput.includes(decl)) {
        this.declarationsOutput.push(decl);
      }

      this.emit(`  ${reg} = call ${destType} @${intrinsicName}(double ${val})`);
      return reg;
    }
    if (srcType.startsWith("i") && destType === "double") {
      const op = this.isSigned(srcTypeNode) ? "sitofp" : "uitofp";
      this.emit(`  ${reg} = ${op} ${srcType} ${val} to double`);
      return reg;
    }

    // Integer casts
    if (srcType.startsWith("i") && destType.startsWith("i")) {
      const srcWidth = this.getBitWidth(srcType);
      const destWidth = this.getBitWidth(destType);

      if (srcWidth > destWidth) {
        this.emit(`  ${reg} = trunc ${srcType} ${val} to ${destType}`);
        return reg;
      } else if (srcWidth < destWidth) {
        // For implicit conversions (like literal to variable), we might not have explicit cast.
        // But here we are generating code.
        // If we are extending, we need to know if source is signed.
        // If source is a literal (e.g. -10), it might be typed as 'int' (i32) but we want to assign to 'i8'.
        // Wait, if we assign -10 (i32) to i8, that's truncation, not extension.
        // If we assign 10 (i32) to i64, that's extension.

        const op = this.isSigned(srcTypeNode) ? "sext" : "zext";
        this.emit(`  ${reg} = ${op} ${srcType} ${val} to ${destType}`);
        return reg;
      }
      // Widths are equal, but types might differ (e.g. i32 vs u32) - no-op in LLVM
      // But we allocated a register!
      // We should have returned earlier if srcType === destType.
      // If srcType is i32 and destType is i32, we returned.
      // If srcType is i32 and destType is u32 (which is also i32 in LLVM), we returned.
      // So this block is unreachable if widths are equal.
      // But let's be safe.
      return val;
    }

    // Struct slicing: Child -> Parent (extract parent fields only)
    if (
      srcType.startsWith("%struct.") &&
      destType.startsWith("%struct.") &&
      srcTypeNode.kind === "BasicType" &&
      destTypeNode.kind === "BasicType"
    ) {
      // Extract struct names
      const srcStructName = srcType.substring(8); // Remove "%struct."
      const destStructName = destType.substring(8);

      // Get struct declarations
      const srcStruct = this.structMap.get(srcStructName);
      const destStruct = this.structMap.get(destStructName);

      if (srcStruct && destStruct) {
        // Check if this is a parent-child relationship
        // If destStruct is a parent of srcStruct, we need to extract only parent fields
        const destLayout = this.structLayouts.get(destStructName);
        const srcLayout = this.structLayouts.get(srcStructName);

        if (destLayout && srcLayout) {
          // Build the parent struct by extracting fields one by one
          let resultReg = "undef";

          // Extract each field from the child struct and insert into parent
          for (const [fieldName, destIndex] of destLayout.entries()) {
            // Handle vtable separately - use parent's vtable, not child's
            if (fieldName === "__vtable__") {
              // Get the parent's vtable
              const vtableEntries = this.vtableLayouts.get(destStructName);
              if (vtableEntries && vtableEntries.length > 0) {
                const vtablePtr = this.newRegister();
                this.emit(
                  `  ${vtablePtr} = bitcast [${vtableEntries.length} x i8*]* @${destStructName}_vtable to i8*`,
                );
                const nextReg = this.newRegister();
                this.emit(
                  `  ${nextReg} = insertvalue ${destType} ${resultReg}, i8* ${vtablePtr}, ${destIndex}`,
                );
                resultReg = nextReg;
              }
              continue;
            }

            const srcIndex = srcLayout.get(fieldName);
            if (srcIndex !== undefined) {
              // Extract field from source
              const fieldReg = this.newRegister();
              this.emit(
                `  ${fieldReg} = extractvalue ${srcType} ${val}, ${srcIndex}`,
              );

              // Determine field type by looking up the field in the dest struct
              const destField = this.getAllStructFields(destStruct).find(
                (f) => f.name === fieldName,
              );
              const fieldType = destField
                ? this.resolveType(destField.type)
                : "i8*";

              // Insert into destination
              const nextReg = this.newRegister();
              this.emit(
                `  ${nextReg} = insertvalue ${destType} ${resultReg}, ${fieldType} ${fieldReg}, ${destIndex}`,
              );
              resultReg = nextReg;
            }
          }

          return resultReg;
        }
      }
    }

    // Enum/Struct casts (e.g. Option -> Option<i32>)
    if (
      (srcType.startsWith("%enum.") || srcType.startsWith("%struct.")) &&
      (destType.startsWith("%enum.") || destType.startsWith("%struct."))
    ) {
      // Extract tag (index 0) from source
      const tag = this.newRegister();
      this.emit(`  ${tag} = extractvalue ${srcType} ${val}, 0`);

      // Create destination value with the same tag
      let destValue = this.newRegister();
      this.emit(
        `  ${destValue} = insertvalue ${destType} undef, i32 ${tag}, 0`,
      );

      // If both enums have data payloads (index 1), copy the data as well
      if (srcType.startsWith("%enum.") && destType.startsWith("%enum.")) {
        const srcEnumName = srcType.substring(6);
        const destEnumName = destType.substring(6);
        const srcDataSize = this.enumDataSizes.get(srcEnumName) || 0;
        const destDataSize = this.enumDataSizes.get(destEnumName) || 0;

        // Copy data if both enums have data payloads
        if (srcDataSize > 0 && destDataSize > 0) {
          // Extract data array from source (index 1)
          const srcData = this.newRegister();
          this.emit(`  ${srcData} = extractvalue ${srcType} ${val}, 1`);

          // Bitcast data arrays to match types if sizes differ
          if (srcDataSize === destDataSize) {
            // Same size, insert directly
            const destWithData = this.newRegister();
            this.emit(
              `  ${destWithData} = insertvalue ${destType} ${destValue}, [${destDataSize} x i8] ${srcData}, 1`,
            );
            destValue = destWithData;
          } else {
            // Different sizes - copy byte-by-byte via memory
            const srcPtr = this.allocateStack(
              `enum_cast_src_${this.labelCount++}`,
              srcType,
            );
            this.emit(`  store ${srcType} ${val}, ${srcType}* ${srcPtr}`);

            const srcDataPtr = this.newRegister();
            this.emit(
              `  ${srcDataPtr} = getelementptr inbounds ${srcType}, ${srcType}* ${srcPtr}, i32 0, i32 1`,
            );
            const srcDataI8Ptr = this.newRegister();
            this.emit(
              `  ${srcDataI8Ptr} = bitcast [${srcDataSize} x i8]* ${srcDataPtr} to i8*`,
            );

            const destPtr = this.allocateStack(
              `enum_cast_dest_${this.labelCount++}`,
              destType,
            );
            this.emit(
              `  store ${destType} ${destValue}, ${destType}* ${destPtr}`,
            );

            const destDataPtr = this.newRegister();
            this.emit(
              `  ${destDataPtr} = getelementptr inbounds ${destType}, ${destType}* ${destPtr}, i32 0, i32 1`,
            );
            const destDataI8Ptr = this.newRegister();
            this.emit(
              `  ${destDataI8Ptr} = bitcast [${destDataSize} x i8]* ${destDataPtr} to i8*`,
            );

            // Copy min(srcDataSize, destDataSize) bytes
            const copySize = Math.min(srcDataSize, destDataSize);
            this.emit(
              `  call void @llvm.memcpy.p0i8.p0i8.i64(i8* ${destDataI8Ptr}, i8* ${srcDataI8Ptr}, i64 ${copySize}, i1 false)`,
            );

            const finalValue = this.newRegister();
            this.emit(
              `  ${finalValue} = load ${destType}, ${destType}* ${destPtr}`,
            );
            destValue = finalValue;
          }
        }
      }

      return destValue;
    }

    throw new CompilerError(
      `Unsupported cast from ${srcType} to ${destType}`,
      "CastError",
      srcTypeNode.location,
    );
  }

  protected requestThunk(
    thunkName: string,
    retType: string,
    paramTypes: string[],
    rawFuncPtrType: string,
  ): void {
    if (this.thunks.has(thunkName)) return;
    this.thunks.add(thunkName);

    // Thunk Signature: retType (i8*, params...)
    const paramsListDef = [
      "i8* %ctx",
      ...paramTypes.map((t, i) => `${t} %p${i}`),
    ].join(", ");

    const methodBody: string[] = [];
    methodBody.push(`define ${retType} @${thunkName}(${paramsListDef}) {`);
    methodBody.push(`entry:`);

    // Cast ctx to raw function pointer
    methodBody.push(`  %fn = bitcast i8* %ctx to ${rawFuncPtrType}`);

    // Call arguments
    const callArgs = paramTypes.map((t, i) => `${t} %p${i}`).join(", ");

    const callInst = retType === "void" ? "call" : "%ret = call";
    methodBody.push(`  ${callInst} ${rawFuncPtrType} %fn(${callArgs})`);

    if (retType === "void") {
      methodBody.push(`  ret void`);
    } else {
      methodBody.push(`  ret ${retType} %ret`);
    }

    methodBody.push(`}`);

    this.declarationsOutput.push(methodBody.join("\n"));
  }
}
