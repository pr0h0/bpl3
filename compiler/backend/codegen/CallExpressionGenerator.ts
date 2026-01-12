/**
 * CallExpressionGenerator - Handles function call generation
 * Part of the ExpressionGenerator inheritance chain
 */
import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { codeGenLog } from "../../common/Logger";
import { PRIMITIVE_STRUCT_MAP } from "../../middleend/BuiltinTypes";
import { BinaryExpressionGenerator } from "./BinaryExpressionGenerator";
import { RTTI } from "../../middleend/RTTI";
import { getIntegerBitWidth } from "./utils";

export abstract class CallExpressionGenerator extends BinaryExpressionGenerator {
  protected abstract generateBlock(block: AST.BlockStmt): void;
  protected abstract generateExpression(expr: AST.Expression): string;
  protected abstract generateLiteral(expr: AST.LiteralExpr): string;
  protected abstract generateIdentifier(expr: AST.IdentifierExpr): string;
  protected abstract generateLambda(expr: AST.LambdaExpr): string;
  protected abstract generateMember(expr: AST.MemberExpr): string;
  protected abstract generateAnyConstruction(
    val: string,
    srcType: string,
    srcTypeNode: AST.TypeNode,
  ): string;
  protected abstract getAllSpecMethods(
    specDecl: AST.SpecDecl,
  ): AST.SpecMethod[];
  protected abstract getOrGenerateSpecVTable(
    structType: AST.BasicTypeNode,
    specType: AST.BasicTypeNode,
  ): string;
  protected abstract emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string;

  /**
   * Generate virtual method call through vtable
   */
  protected generateVirtualCall(
    callExpr: AST.CallExpr,
    memberExpr: AST.MemberExpr,
    structName: string,
    methodIndex: number,
    argsToGenerate: AST.Expression[],
  ): string {
    const objRaw = this.generateExpression(memberExpr.object);
    const objType = this.resolveType(memberExpr.object.resolvedType!);

    const { objPtr, structType } = this.prepareVirtualCallObject(
      memberExpr,
      objRaw,
      objType,
      structName,
    );

    const methodVoidPtr = this.loadVTableMethod(
      objPtr,
      structType,
      methodIndex,
    );

    const {
      funcType: _funcType,
      retType,
      paramTypes,
    } = this.resolveVirtualMethodSignature(callExpr, memberExpr, structName);

    const funcSig = `${retType} (${paramTypes.join(", ")})`;
    const funcPtr = this.newRegister();
    this.emit(`  ${funcPtr} = bitcast i8* ${methodVoidPtr} to ${funcSig}*`);

    const callArgs = this.prepareVirtualCallArgs(
      objPtr,
      structType,
      paramTypes,
      argsToGenerate,
      _funcType.paramTypes,
    );

    const resultReg = this.newRegister();
    if (retType === "void") {
      this.emit(`  call void ${funcPtr}(${callArgs.join(", ")})`);
      return "0";
    }
    this.emit(
      `  ${resultReg} = call ${retType} ${funcPtr}(${callArgs.join(", ")})`,
    );
    return resultReg;
  }

  /**
   * Prepare object for virtual call (boxing primitives, getting address)
   */
  private prepareVirtualCallObject(
    memberExpr: AST.MemberExpr,
    objRaw: string,
    objType: string,
    structName: string,
  ): { objPtr: string; structType: string } {
    let objPtr = objRaw;
    let structType = objType;

    const resolvedType = memberExpr.object.resolvedType!;
    if (
      resolvedType.kind === "BasicType" &&
      PRIMITIVE_STRUCT_MAP[resolvedType.name] === structName
    ) {
      return this.boxPrimitiveForVirtualCall(objRaw, objType, structName);
    }

    if (!objType.endsWith("*")) {
      try {
        objPtr = this.generateAddress(memberExpr.object);
        structType = objType + "*";
      } catch {
        const spillAddr = this.allocateStack(
          `vcall_spill_${this.labelCount++}`,
          objType,
        );
        this.emit(`  store ${objType} ${objRaw}, ${objType}* ${spillAddr}`);
        objPtr = spillAddr;
        structType = objType + "*";
      }
    }

    return { objPtr, structType };
  }

  /**
   * Box a primitive value for virtual call
   */
  private boxPrimitiveForVirtualCall(
    objRaw: string,
    objType: string,
    structName: string,
  ): { objPtr: string; structType: string } {
    const wrapperType = `%struct.${structName}`;
    const wrapperPtr = this.allocateStack(
      `boxed_${structName}_${this.labelCount++}`,
      wrapperType,
    );

    const vtablePtrPtr = this.newRegister();
    this.emit(
      `  ${vtablePtrPtr} = getelementptr ${wrapperType}, ${wrapperType}* ${wrapperPtr}, i32 0, i32 0`,
    );
    const vtableGlobal = `@${structName}_vtable`;
    const vtableType = `[${this.vtableLayouts.get(structName)!.length} x i8*]`;
    const vtableCast = this.newRegister();
    this.emit(
      `  ${vtableCast} = bitcast ${vtableType}* ${vtableGlobal} to i8*`,
    );
    this.emit(`  store i8* ${vtableCast}, i8** ${vtablePtrPtr}`);

    const valuePtr = this.newRegister();
    this.emit(
      `  ${valuePtr} = getelementptr ${wrapperType}, ${wrapperType}* ${wrapperPtr}, i32 0, i32 1`,
    );
    this.emit(`  store ${objType} ${objRaw}, ${objType}* ${valuePtr}`);

    return { objPtr: wrapperPtr, structType: wrapperType + "*" };
  }

  /**
   * Load method pointer from vtable
   */
  private loadVTableMethod(
    objPtr: string,
    structType: string,
    methodIndex: number,
  ): string {
    const vtablePtrPtr = this.newRegister();
    this.emit(
      `  ${vtablePtrPtr} = getelementptr ${structType.slice(
        0,
        -1,
      )}, ${structType} ${objPtr}, i32 0, i32 0`,
    );

    const vtablePtr = this.newRegister();
    this.emit(`  ${vtablePtr} = load i8*, i8** ${vtablePtrPtr}`);

    const vtableArrayPtr = this.newRegister();
    this.emit(`  ${vtableArrayPtr} = bitcast i8* ${vtablePtr} to i8**`);

    const methodPtrPtr = this.newRegister();
    this.emit(
      `  ${methodPtrPtr} = getelementptr i8*, i8** ${vtableArrayPtr}, i32 ${methodIndex}`,
    );

    const methodVoidPtr = this.newRegister();
    this.emit(`  ${methodVoidPtr} = load i8*, i8** ${methodPtrPtr}`);

    return methodVoidPtr;
  }

  /**
   * Resolve virtual method type signature
   */
  private resolveVirtualMethodSignature(
    callExpr: AST.CallExpr,
    memberExpr: AST.MemberExpr,
    structName: string,
  ): { funcType: AST.FunctionTypeNode; retType: string; paramTypes: string[] } {
    let structDecl = this.structMap.get(structName);
    if (!structDecl) {
      const typeNode = memberExpr.object.resolvedType as AST.BasicTypeNode;
      if (
        typeNode.resolvedDeclaration &&
        typeNode.resolvedDeclaration.kind === "StructDecl"
      ) {
        structDecl = typeNode.resolvedDeclaration as AST.StructDecl;
      }
    }

    if (!structDecl) {
      throw new CompilerError(
        `Struct declaration for ${structName} not found during virtual call generation`,
        "",
        memberExpr.location,
      );
    }

    const { methodDecl, genericMap } = this.findVirtualMethod(
      callExpr,
      memberExpr,
      structDecl,
    );

    let funcType = methodDecl.resolvedType as AST.FunctionTypeNode;
    if (genericMap.size > 0) {
      funcType = {
        ...funcType,
        returnType: this.substituteType(funcType.returnType, genericMap),
        paramTypes: funcType.paramTypes.map((p) =>
          this.substituteType(p, genericMap),
        ),
      };
    }

    const retType = this.resolveType(funcType.returnType);
    const paramTypes = funcType.paramTypes.map((t) => this.resolveType(t));

    return { funcType, retType, paramTypes };
  }

  /**
   * Find virtual method in struct hierarchy
   */
  private findVirtualMethod(
    callExpr: AST.CallExpr,
    memberExpr: AST.MemberExpr,
    structDecl: AST.StructDecl,
  ): { methodDecl: AST.FunctionDecl; genericMap: Map<string, AST.TypeNode> } {
    let methodDecl: AST.FunctionDecl | undefined;
    let currentDecl: AST.StructDecl | undefined = structDecl;
    const genericMap = new Map<string, AST.TypeNode>();

    const targetDecl =
      callExpr.resolvedDeclaration &&
      callExpr.resolvedDeclaration.kind === "FunctionDecl"
        ? (callExpr.resolvedDeclaration as AST.FunctionDecl)
        : undefined;

    while (currentDecl) {
      const found = this.findMethodInDecl(
        currentDecl,
        memberExpr.property,
        targetDecl,
      );

      if (found) {
        methodDecl = found;
        break;
      }

      const parentResult = this.getParentDecl(currentDecl, genericMap);
      if (!parentResult) break;
      currentDecl = parentResult;
    }

    if (!methodDecl) {
      throw new CompilerError(
        `Method ${memberExpr.property} not found in struct ${structDecl.name}`,
        "",
        memberExpr.location,
      );
    }

    return { methodDecl, genericMap };
  }

  /**
   * Find method in a single struct declaration
   */
  private findMethodInDecl(
    decl: AST.StructDecl,
    methodName: string,
    targetDecl?: AST.FunctionDecl,
  ): AST.FunctionDecl | undefined {
    if (targetDecl) {
      let found = decl.members.find((m) => {
        if (m.kind !== "FunctionDecl") return false;
        const fd = m as AST.FunctionDecl;
        if (fd.name !== methodName) return false;
        if (fd === targetDecl) return true;

        if (
          fd.resolvedType &&
          targetDecl.resolvedType &&
          fd.resolvedType.kind === "FunctionType" &&
          targetDecl.resolvedType.kind === "FunctionType"
        ) {
          const m1 = this.getMangledName(
            fd.name,
            fd.resolvedType as AST.FunctionTypeNode,
          );
          const m2 = this.getMangledName(
            targetDecl.name,
            targetDecl.resolvedType as AST.FunctionTypeNode,
          );
          return m1 === m2;
        }
        return false;
      }) as AST.FunctionDecl | undefined;

      if (!found) {
        const candidates = decl.members.filter(
          (m) => m.kind === "FunctionDecl" && m.name === methodName,
        ) as AST.FunctionDecl[];
        if (candidates.length === 1) {
          found = candidates[0];
        }
      }
      return found;
    }

    return decl.members.find(
      (m) => m.kind === "FunctionDecl" && m.name === methodName,
    ) as AST.FunctionDecl | undefined;
  }

  /**
   * Get parent struct declaration
   */
  private getParentDecl(
    currentDecl: AST.StructDecl,
    genericMap: Map<string, AST.TypeNode>,
  ): AST.StructDecl | undefined {
    if (!currentDecl.inheritanceList) return undefined;

    for (const parent of currentDecl.inheritanceList) {
      if (
        parent.kind === "BasicType" &&
        parent.resolvedDeclaration &&
        parent.resolvedDeclaration.kind === "StructDecl"
      ) {
        const parentDecl = parent.resolvedDeclaration as AST.StructDecl;

        if (parentDecl.genericParams && parent.genericArgs) {
          for (let i = 0; i < parentDecl.genericParams.length; i++) {
            if (i < parent.genericArgs.length) {
              let arg = parent.genericArgs[i]!;
              if (genericMap.size > 0) {
                arg = this.substituteType(arg, genericMap);
              }
              genericMap.set(parentDecl.genericParams[i]!.name, arg);
            }
          }
        }
        return parentDecl;
      }
    }
    return undefined;
  }

  /**
   * Prepare arguments for virtual call
   */
  private prepareVirtualCallArgs(
    objPtr: string,
    structType: string,
    paramTypes: string[],
    argsToGenerate: AST.Expression[],
    paramTypeNodes: AST.TypeNode[],
  ): string[] {
    const callArgs: string[] = [];
    // callArgs.push("i8* null"); // Removed implicit context for virtual calls as they are frames

    const thisType = paramTypes[0]!;

    if (thisType.endsWith("*")) {
      const thisArg = this.newRegister();
      this.emit(
        `  ${thisArg} = bitcast ${structType} ${objPtr} to ${thisType}`,
      );
      callArgs.push(`${thisType} ${thisArg}`);
    } else {
      const ptrType = thisType + "*";
      const ptrReg = this.newRegister();
      this.emit(`  ${ptrReg} = bitcast ${structType} ${objPtr} to ${ptrType}`);

      const valReg = this.newRegister();
      this.emit(`  ${valReg} = load ${thisType}, ${ptrType} ${ptrReg}`);

      callArgs.push(`${thisType} ${valReg}`);
    }

    for (let i = 0; i < argsToGenerate.length; i++) {
      const arg = argsToGenerate[i]!;
      const val = this.generateExpression(arg);
      const destTypeStr = paramTypes[i + 1]!;
      const destTypeNode = paramTypeNodes[i + 1]!;

      // Synthetic FunctionType for Identifiers
      let resolvedArgType: AST.TypeNode = arg.resolvedType!;
      if (
        arg.kind === "Identifier" &&
        arg.resolvedDeclaration &&
        arg.resolvedDeclaration.kind === "FunctionDecl"
      ) {
        const fnDecl = arg.resolvedDeclaration as AST.FunctionDecl;
        resolvedArgType = {
          kind: "FunctionType",
          returnType: fnDecl.returnType,
          paramTypes: fnDecl.params.map((p) => p.type),
          declaration: fnDecl,
          isVariadic: false,
          location: arg.location,
        };
      }

      const srcTypeStr = this.resolveType(resolvedArgType);

      // Use emitCast for all conversions (including Function -> Lambda, bitcasts, etc)
      const castVal = this.emitCast(
        val,
        srcTypeStr,
        destTypeStr,
        resolvedArgType,
        destTypeNode,
      );

      callArgs.push(`${destTypeStr} ${castVal}`);
    }

    return callArgs;
  }

  /**
   * Generate spec (interface) method call
   */
  protected generateSpecMethodCall(
    callExpr: AST.CallExpr,
    memberExpr: AST.MemberExpr,
    specDecl: AST.SpecDecl,
  ): string {
    let objVal = this.generateExpression(memberExpr.object);
    const objType = memberExpr.object.resolvedType as AST.BasicTypeNode;

    if (objType.pointerDepth > 0) {
      const loaded = this.newRegister();
      const ptrType = this.resolveType(objType);
      const valType = ptrType.substring(0, ptrType.length - 1);
      this.emit(`  ${loaded} = load ${valType}, ${ptrType} ${objVal}`);
      objVal = loaded;
    }

    const objPtr = this.newRegister();
    this.emit(`  ${objPtr} = extractvalue { i8*, i8* } ${objVal}, 0`);

    const vtablePtr = this.newRegister();
    this.emit(`  ${vtablePtr} = extractvalue { i8*, i8* } ${objVal}, 1`);

    const allMethods = this.getAllSpecMethods(specDecl);
    const methodIndex = allMethods.findIndex(
      (m) => m.name === memberExpr.property,
    );
    if (methodIndex === -1) {
      throw new CompilerError(
        `Method ${memberExpr.property} not found in spec ${specDecl.name}`,
        "",
        memberExpr.location,
      );
    }

    const vtableArrayPtr = this.newRegister();
    this.emit(`  ${vtableArrayPtr} = bitcast i8* ${vtablePtr} to i8**`);

    const methodPtrPtr = this.newRegister();
    this.emit(
      `  ${methodPtrPtr} = getelementptr i8*, i8** ${vtableArrayPtr}, i32 ${methodIndex}`,
    );

    const methodVoidPtr = this.newRegister();
    this.emit(`  ${methodVoidPtr} = load i8*, i8** ${methodPtrPtr}`);

    const { retType, paramTypes, funcPtr } = this.resolveSpecMethodSignature(
      specDecl,
      memberExpr,
      allMethods[methodIndex]!,
      methodVoidPtr,
    );

    const argRegs: string[] = [];
    for (let i = 0; i < callExpr.args.length; i++) {
      const arg = callExpr.args[i]!;
      const val = this.generateExpression(arg);
      // Attempt cast if type mismatch
      if (i < paramTypes.length) {
        const srcType = this.resolveType(arg.resolvedType!);
        const destType = paramTypes[i]!; // paramTypes excludes this (implied objPtr)

        if (srcType !== destType) {
          const castVal = this.emitCast(
            val,
            srcType,
            destType,
            arg.resolvedType!,
            { kind: "BasicType", name: "dummy" } as any,
          ); // we need type node
          argRegs.push(castVal);
        } else {
          argRegs.push(val);
        }
      } else {
        argRegs.push(val);
      }
    }

    const callArgs = [`i8* ${objPtr}`];
    for (let i = 0; i < argRegs.length; i++) {
      callArgs.push(`${paramTypes[i]} ${argRegs[i]}`);
    }

    const resultReg = this.newRegister();
    if (retType === "void") {
      this.emit(`  call void ${funcPtr}(${callArgs.join(", ")})`);
      return "0";
    }
    this.emit(
      `  ${resultReg} = call ${retType} ${funcPtr}(${callArgs.join(", ")})`,
    );
    return resultReg;
  }

  /**
   * Resolve spec method signature
   */
  private resolveSpecMethodSignature(
    specDecl: AST.SpecDecl,
    memberExpr: AST.MemberExpr,
    methodDecl: AST.SpecMethod,
    methodVoidPtr: string,
  ): { retType: string; paramTypes: string[]; funcPtr: string } {
    const typeMap = new Map<string, AST.TypeNode>();
    if (specDecl.genericParams) {
      const objType = memberExpr.object.resolvedType as AST.BasicTypeNode;
      for (let i = 0; i < specDecl.genericParams.length; i++) {
        if (i < objType.genericArgs.length) {
          typeMap.set(specDecl.genericParams[i]!.name, objType.genericArgs[i]!);
        }
      }
    }

    const paramTypes: string[] = [];
    for (const p of methodDecl.params) {
      if (p.name === "this") continue;
      let pType = p.type;
      if (!pType) {
        codeGenLog.error("Param type is undefined", { param: p.name });
        continue;
      }
      if (typeMap.size > 0) {
        pType = this.substituteType(pType, typeMap);
      }
      paramTypes.push(this.resolveType(pType));
    }

    let retTypeNode = methodDecl.returnType;
    if (!retTypeNode) {
      retTypeNode = {
        kind: "BasicType",
        name: "void",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: methodDecl.location,
      } as AST.BasicTypeNode;
    }
    if (typeMap.size > 0) {
      retTypeNode = this.substituteType(retTypeNode, typeMap);
    }
    const retType = this.resolveType(retTypeNode);

    const paramsStr = paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
    const funcSig = `${retType} (i8*${paramsStr})`;
    const funcPtr = this.newRegister();
    this.emit(`  ${funcPtr} = bitcast i8* ${methodVoidPtr} to ${funcSig}*`);

    return { retType, paramTypes, funcPtr };
  }

  // findInstantiatedParentType is inherited from TypeGenerator

  /**
   * Handle __type_id intrinsic
   */
  protected handleTypeIdIntrinsic(expr: AST.CallExpr): string | null {
    let calleeName = "";
    if (expr.callee.kind === "Identifier") {
      calleeName = (expr.callee as AST.IdentifierExpr).name;
    } else if (expr.callee.kind === "GenericInstantiation") {
      const genExpr = expr.callee as AST.GenericInstantiationExpr;
      if (genExpr.base.kind === "Identifier") {
        calleeName = (genExpr.base as AST.IdentifierExpr).name;
      }
    }

    if (calleeName !== "__type_id") return null;

    let genericArgs = expr.genericArgs || [];
    if (
      genericArgs.length === 0 &&
      expr.callee.kind === "GenericInstantiation"
    ) {
      genericArgs = (expr.callee as AST.GenericInstantiationExpr).genericArgs;
    }

    if (genericArgs.length === 1) {
      let typeArg = genericArgs[0]!;
      if (this.currentTypeMap.size > 0) {
        typeArg = this.substituteType(typeArg, this.currentTypeMap);
      }
      const typeId = RTTI.getTypeId(typeArg);
      return `${typeId}`;
    }
    return null;
  }

  /**
   * Handle enum variant constructor call
   */
  protected handleEnumVariantConstructor(expr: AST.CallExpr): string | null {
    const enumVariantInfo = (
      expr as {
        enumVariantInfo?: {
          enumDecl: AST.EnumDecl;
          variant: AST.EnumVariant;
          variantIndex: number;
        };
      }
    ).enumVariantInfo;

    if (!enumVariantInfo) return null;

    const variant = enumVariantInfo.variant;
    const variantIndex = enumVariantInfo.variantIndex;
    const enumType = this.resolveType(expr.resolvedType!);

    const enumPtr = this.newRegister();
    this.emit(`  ${enumPtr} = alloca ${enumType}`);

    const tagPtr = this.newRegister();
    this.emit(
      `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 0`,
    );
    this.emit(`  store i32 ${variantIndex}, i32* ${tagPtr}`);

    if (variant.dataType && expr.args.length > 0) {
      const dataPtr = this.newRegister();
      this.emit(
        `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 1`,
      );

      if (variant.dataType.kind === "EnumVariantTuple") {
        const enumName = enumType.substring(6);
        const dataSize = this.enumDataSizes.get(enumName) || 64;

        const bytePtr = this.newRegister();
        this.emit(
          `  ${bytePtr} = bitcast [${dataSize} x i8]* ${dataPtr} to i8*`,
        );

        let byteOffset = 0;
        for (let i = 0; i < expr.args.length; i++) {
          const argValue = this.generateExpression(expr.args[i]!);
          const argType = this.resolveType(expr.args[i]!.resolvedType!);
          const argSize = this.getTypeSize(argType);

          const alignment = this.getAlignmentForSize(argSize);
          if (byteOffset % alignment !== 0) {
            byteOffset = Math.ceil(byteOffset / alignment) * alignment;
          }

          let storePtr: string;
          if (byteOffset === 0) {
            storePtr = this.newRegister();
            this.emit(`  ${storePtr} = bitcast i8* ${bytePtr} to ${argType}*`);
          } else {
            const offsetPtr = this.newRegister();
            this.emit(
              `  ${offsetPtr} = getelementptr i8, i8* ${bytePtr}, i32 ${byteOffset}`,
            );
            storePtr = this.newRegister();
            this.emit(
              `  ${storePtr} = bitcast i8* ${offsetPtr} to ${argType}*`,
            );
          }

          this.emit(`  store ${argType} ${argValue}, ${argType}* ${storePtr}`);

          byteOffset += argSize;
        }
      }
    }

    const result = this.newRegister();
    this.emit(`  ${result} = load ${enumType}, ${enumType}* ${enumPtr}`);

    return result;
  }

  /**
   * Handle operator overload (__call__)
   */
  protected handleCallOperatorOverload(expr: AST.CallExpr): string | null {
    if (!expr.operatorOverload) return null;

    const overload = expr.operatorOverload;
    const method = overload.methodDeclaration;
    const calleeRaw = this.generateExpression(expr.callee);

    const targetType = overload.targetType as AST.BasicTypeNode;
    const structName = targetType.name;

    const methodType = method.resolvedType as AST.FunctionTypeNode;
    const fullMethodName = `${structName}_${method.name}`;
    const mangledName = this.getMangledName(fullMethodName, methodType);

    const calleeType = this.resolveType(expr.callee.resolvedType!);
    let thisPtr: string;
    try {
      thisPtr = this.generateAddress(expr.callee);
    } catch {
      const spillAddr = this.allocateStack(
        `op_spill_${this.labelCount++}`,
        calleeType,
      );
      this.emit(
        `  store ${calleeType} ${calleeRaw}, ${calleeType}* ${spillAddr}`,
      );
      thisPtr = spillAddr;
    }

    const argRegs: string[] = [];
    const argTypes: string[] = [];
    for (const arg of expr.args) {
      const argVal = this.generateExpression(arg);
      const argType = this.resolveType(arg.resolvedType!);
      argRegs.push(argVal);
      argTypes.push(argType);
    }

    const callArgs = [`i8* null`, `${calleeType}* ${thisPtr}`];
    for (let i = 0; i < argRegs.length; i++) {
      callArgs.push(`${argTypes[i]} ${argRegs[i]}`);
    }

    const returnType = this.resolveType(method.returnType);
    const resultReg = this.newRegister();
    this.emit(
      `  ${resultReg} = call ${returnType} @${mangledName}(${callArgs.join(", ")})`,
    );
    return resultReg;
  }

  protected generateCall(expr: AST.CallExpr): string {
    let calleeName = "";
    if (expr.callee.kind === "Identifier") {
      calleeName = (expr.callee as AST.IdentifierExpr).name;
    } else if (expr.callee.kind === "GenericInstantiation") {
      const genExpr = expr.callee as AST.GenericInstantiationExpr;
      if (genExpr.base.kind === "Identifier") {
        calleeName = (genExpr.base as AST.IdentifierExpr).name;
      }
    }

    if (calleeName === "__type_id") {
      let genericArgs = expr.genericArgs || [];
      if (
        genericArgs.length === 0 &&
        expr.callee.kind === "GenericInstantiation"
      ) {
        genericArgs = (expr.callee as AST.GenericInstantiationExpr).genericArgs;
      }

      if (genericArgs.length === 1) {
        let typeArg = genericArgs[0]!;
        if (this.currentTypeMap.size > 0) {
          typeArg = this.substituteType(typeArg, this.currentTypeMap);
        }
        const typeId = RTTI.getTypeId(typeArg);
        return `${typeId}`;
      }
    }

    if (calleeName === "__type_info") {
      let genericArgs = expr.genericArgs || [];
      if (
        genericArgs.length === 0 &&
        expr.callee.kind === "GenericInstantiation"
      ) {
        genericArgs = (expr.callee as AST.GenericInstantiationExpr).genericArgs;
      }

      if (genericArgs.length === 1) {
        let typeArg = genericArgs[0]!;

        if (this.currentTypeMap.size > 0) {
          typeArg = this.substituteType(typeArg, this.currentTypeMap);
        }
        // Return the global pointer to TypeInfo
        return this.getOrCreateTypeInfo(typeArg);
      }
    }

    let decl: any;
    // Check for enum variant constructor
    const enumVariantInfo = (expr as any).enumVariantInfo;
    if (enumVariantInfo) {
      // This is an enum variant constructor call
      const _enumDecl = enumVariantInfo.enumDecl as AST.EnumDecl;
      const variant = enumVariantInfo.variant as AST.EnumVariant;
      const variantIndex = enumVariantInfo.variantIndex as number;

      // Generate code to construct the enum value
      const enumType = this.resolveType(expr.resolvedType!);

      // Allocate space on stack to build the enum value
      const enumPtr = this.newRegister();
      this.emit(`  ${enumPtr} = alloca ${enumType}`);

      // Get pointer to tag field and store the discriminant
      const tagPtr = this.newRegister();
      this.emit(
        `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 0`,
      );
      this.emit(`  store i32 ${variantIndex}, i32* ${tagPtr}`);

      // Handle tuple/struct data if present
      if (variant.dataType && expr.args.length > 0) {
        // Get pointer to data field
        const dataPtr = this.newRegister();
        this.emit(
          `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 1`,
        );

        if (variant.dataType.kind === "EnumVariantTuple") {
          // Get enum name from type (strip "%enum." prefix)
          const enumName = enumType.substring(6);
          const dataSize = this.enumDataSizes.get(enumName) || 64;

          // Store each argument in sequence in the data array with proper byte offsets
          const bytePtr = this.newRegister();
          this.emit(
            `  ${bytePtr} = bitcast [${dataSize} x i8]* ${dataPtr} to i8*`,
          );

          let byteOffset = 0;
          for (let i = 0; i < expr.args.length; i++) {
            let argValue = this.generateExpression(expr.args[i]!);
            const argType = this.resolveType(expr.args[i]!.resolvedType!);
            const _argSize = this.getTypeSize(argType);

            // Get expected field type from variant definition
            const tupleVariant = variant.dataType as AST.EnumVariantTuple;
            let fieldTypeNode = tupleVariant.types[i]!;

            // Substitute generic type parameters if enum is generic
            if (expr.resolvedType && expr.resolvedType.kind === "BasicType") {
              const enumTypeNode = expr.resolvedType as AST.BasicTypeNode;
              if (
                enumTypeNode.genericArgs &&
                enumTypeNode.genericArgs.length > 0 &&
                _enumDecl.genericParams &&
                _enumDecl.genericParams.length > 0
              ) {
                // Build context map for generic substitution
                const contextMap = new Map<string, AST.TypeNode>();
                for (let j = 0; j < _enumDecl.genericParams.length; j++) {
                  contextMap.set(
                    _enumDecl.genericParams[j]!.name,
                    enumTypeNode.genericArgs[j]!,
                  );
                }
                fieldTypeNode = this.substituteType(fieldTypeNode, contextMap);
              }
            }

            const expectedFieldType = this.resolveType(fieldTypeNode);

            // Truncate if necessary (e.g., i32 -> i8)
            if (argType !== expectedFieldType) {
              const argTypeSize = getIntegerBitWidth(argType);
              const expectedSize = getIntegerBitWidth(expectedFieldType);
              if (argTypeSize > expectedSize) {
                const truncReg = this.newRegister();
                this.emit(
                  `  ${truncReg} = trunc ${argType} ${argValue} to ${expectedFieldType}`,
                );
                argValue = truncReg;
              }
            }

            // Use the expected field type for storage
            const storeType = expectedFieldType;
            const storeSize = this.getTypeSize(storeType);

            const alignment = this.getAlignmentForSize(storeSize);
            if (byteOffset % alignment !== 0) {
              byteOffset = Math.ceil(byteOffset / alignment) * alignment;
            }

            // Get pointer at the correct byte offset
            let storePtr: string;
            if (byteOffset === 0) {
              storePtr = this.newRegister();
              this.emit(
                `  ${storePtr} = bitcast i8* ${bytePtr} to ${storeType}*`,
              );
            } else {
              const offsetPtr = this.newRegister();
              this.emit(
                `  ${offsetPtr} = getelementptr i8, i8* ${bytePtr}, i32 ${byteOffset}`,
              );
              storePtr = this.newRegister();
              this.emit(
                `  ${storePtr} = bitcast i8* ${offsetPtr} to ${storeType}*`,
              );
            }

            // Store the value
            this.emit(
              `  store ${storeType} ${argValue}, ${storeType}* ${storePtr}`,
            );

            byteOffset += storeSize;
          }
        }
        // EnumVariantStruct is handled via StructLiteral path in ExpressionGenerator.ts
      }

      // Load the constructed enum value
      const result = this.newRegister();
      this.emit(`  ${result} = load ${enumType}, ${enumType}* ${enumPtr}`);

      return result;
    }

    // Check for operator overload (__call__)
    if (expr.operatorOverload) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const calleeRaw = this.generateExpression(expr.callee);

      // Get the struct name from the target type
      const targetType = overload.targetType as AST.BasicTypeNode;
      const structName = targetType.name;

      // Build the method name with struct prefix
      const methodType = method.resolvedType as AST.FunctionTypeNode;
      const fullMethodName = `${structName}_${method.name}`;
      const mangledName = this.getMangledName(fullMethodName, methodType);

      // Get address of callee (this pointer)
      const calleeType = this.resolveType(expr.callee.resolvedType!);
      let thisPtr: string;
      try {
        thisPtr = this.generateAddress(expr.callee);
      } catch {
        // If we can't get address, spill to stack
        const spillAddr = this.allocateStack(
          `op_spill_${this.labelCount++}`,
          calleeType,
        );
        this.emit(
          `  store ${calleeType} ${calleeRaw}, ${calleeType}* ${spillAddr}`,
        );
        thisPtr = spillAddr;
      }

      // Generate arguments
      const argRegs: string[] = [];
      const argTypes: string[] = [];
      for (const arg of expr.args) {
        const argVal = this.generateExpression(arg);
        const argType = this.resolveType(arg.resolvedType!);
        argRegs.push(argVal);
        argTypes.push(argType);
      }

      // Build argument list for call: context + this pointer + actual args
      const callArgs = [`${calleeType}* ${thisPtr}`];
      for (let i = 0; i < argRegs.length; i++) {
        callArgs.push(`${argTypes[i]} ${argRegs[i]}`);
      }

      // Call the __call__ method
      const returnType = this.resolveType(method.returnType);
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(${callArgs.join(", ")})`,
      );
      return resultReg;
    }

    let funcName = "";

    let argsToGenerate = expr.args;
    let isInstanceCall = false;
    let targetThisType: string | undefined;

    let callee = expr.callee;
    let genericArgs = expr.genericArgs || [];
    const callSubstitutionMap = new Map<string, AST.TypeNode>();

    // Handle generic instantiation expression
    if (callee.kind === "GenericInstantiation") {
      const genExpr = callee as AST.GenericInstantiationExpr;
      callee = genExpr.base;
      genericArgs = genExpr.genericArgs;
    }

    if (callee.kind === "Identifier") {
      const ident = callee as AST.IdentifierExpr;
      funcName = ident.name;

      // Handle intrinsics
      if (funcName === "likely" || funcName === "unlikely") {
        const cond = this.generateExpression(expr.args[0]!);
        const expected = funcName === "likely" ? "1" : "0";
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = call i1 @llvm.expect.i1(i1 ${cond}, i1 ${expected})`,
        );
        return reg;
      } else if (funcName === "prefetch") {
        const ptr = this.generateExpression(expr.args[0]!);
        const rw = this.generateExpression(expr.args[1]!);
        const locality = this.generateExpression(expr.args[2]!);
        const ptrType = this.resolveType(expr.args[0]!.resolvedType!);

        // Cast to i8* if needed
        let ptrI8 = ptr;
        if (ptrType !== "i8*") {
          ptrI8 = this.newRegister();
          this.emit(`  ${ptrI8} = bitcast ${ptrType} ${ptr} to i8*`);
        }

        this.emit(
          `  call void @llvm.prefetch(i8* ${ptrI8}, i32 ${rw}, i32 ${locality}, i32 1)`,
        );
        return "0"; // void
      } else if (funcName === "trap") {
        this.emit(`  call void @llvm.trap()`);
        this.emit(`  unreachable`);
        return "0";
      } else if (funcName === "debugtrap") {
        this.emit(`  call void @llvm.debugtrap()`);
        return "0";
      } else if (
        [
          "sqrt",
          "sin",
          "cos",
          "exp",
          "log",
          "floor",
          "ceil",
          "round",
          "fabs",
        ].includes(funcName)
      ) {
        const arg = this.generateExpression(expr.args[0]!);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = call double @llvm.${funcName}.f64(double ${arg})`,
        );
        return reg;
      } else if (["pow", "minnum", "maxnum", "copysign"].includes(funcName)) {
        const arg1 = this.generateExpression(expr.args[0]!);
        const arg2 = this.generateExpression(expr.args[1]!);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = call double @llvm.${funcName}.f64(double ${arg1}, double ${arg2})`,
        );
        return reg;
      } else if (funcName === "fma") {
        const arg1 = this.generateExpression(expr.args[0]!);
        const arg2 = this.generateExpression(expr.args[1]!);
        const arg3 = this.generateExpression(expr.args[2]!);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = call double @llvm.fma.f64(double ${arg1}, double ${arg2}, double ${arg3})`,
        );
        return reg;
      } else if (funcName === "frameaddress" || funcName === "returnaddress") {
        const level = this.generateExpression(expr.args[0]!);
        const reg = this.newRegister();
        this.emit(`  ${reg} = call i8* @llvm.${funcName}(i32 ${level})`);
        return reg;
      } else if (funcName === "stacksave") {
        const reg = this.newRegister();
        this.emit(`  ${reg} = call i8* @llvm.stacksave()`);
        return reg;
      } else if (funcName === "stackrestore") {
        const ptr = this.generateExpression(expr.args[0]!);
        const ptrType = this.resolveType(expr.args[0]!.resolvedType!);
        let finalPtr = ptr;
        if (ptrType !== "i8*") {
          finalPtr = this.newRegister();
          this.emit(`  ${finalPtr} = bitcast ${ptrType} ${ptr} to i8*`);
        }
        this.emit(`  call void @llvm.stackrestore(i8* ${finalPtr})`);
        return "0";
      } else if (
        ["ctpop", "ctlz", "cttz", "bswap", "bitreverse"].includes(funcName)
      ) {
        const arg = this.generateExpression(expr.args[0]!);
        const reg = this.newRegister();
        // For ctlz and cttz, the second argument is is_zero_undef (i1). We set it to false (0) to be safe (return bit width if zero).
        if (funcName === "ctlz" || funcName === "cttz") {
          this.emit(
            `  ${reg} = call i32 @llvm.${funcName}.i32(i32 ${arg}, i1 0)`,
          );
        } else {
          this.emit(`  ${reg} = call i32 @llvm.${funcName}.i32(i32 ${arg})`);
        }
        return reg;
      } else if (funcName === "memcpy" || funcName === "memmove") {
        const dest = this.generateExpression(expr.args[0]!);
        const src = this.generateExpression(expr.args[1]!);
        const len = this.generateExpression(expr.args[2]!);
        let isVolatile = "0";
        if (expr.args.length > 3 && expr.args[3]) {
          isVolatile = this.generateExpression(expr.args[3]!);
        }

        const destType = this.resolveType(expr.args[0]!.resolvedType!);
        const srcType = this.resolveType(expr.args[1]!.resolvedType!);

        let finalDest = dest;
        if (destType !== "i8*") {
          finalDest = this.newRegister();
          this.emit(`  ${finalDest} = bitcast ${destType} ${dest} to i8*`);
        }

        let finalSrc = src;
        if (srcType !== "i8*") {
          finalSrc = this.newRegister();
          this.emit(`  ${finalSrc} = bitcast ${srcType} ${src} to i8*`);
        }

        this.emit(
          `  call void @llvm.${funcName}.p0i8.p0i8.i64(i8* ${finalDest}, i8* ${finalSrc}, i64 ${len}, i1 ${isVolatile})`,
        );
        return "0";
      } else if (funcName === "memset") {
        const dest = this.generateExpression(expr.args[0]!);
        const val = this.generateExpression(expr.args[1]!);
        const len = this.generateExpression(expr.args[2]!);
        let isVolatile = "0";
        if (expr.args.length > 3 && expr.args[3]) {
          isVolatile = this.generateExpression(expr.args[3]!);
        }

        const destType = this.resolveType(expr.args[0]!.resolvedType!);
        let finalDest = dest;
        if (destType !== "i8*") {
          finalDest = this.newRegister();
          this.emit(`  ${finalDest} = bitcast ${destType} ${dest} to i8*`);
        }

        this.emit(
          `  call void @llvm.memset.p0i8.i64(i8* ${finalDest}, i8 ${val}, i64 ${len}, i1 ${isVolatile})`,
        );
        return "0";
      }

      // Handle generic function call
      if (genericArgs.length > 0) {
        // Find declaration
        // We rely on resolvedType having the declaration
        const funcType = ident.resolvedType as AST.FunctionTypeNode;
        if (funcType && funcType.declaration) {
          funcName = this.resolveMonomorphizedFunction(
            funcType.declaration,
            genericArgs,
          );
          if (
            funcType.declaration.genericParams.length === genericArgs.length
          ) {
            for (let k = 0; k < genericArgs.length; k++) {
              callSubstitutionMap.set(
                funcType.declaration.genericParams[k]!.name,
                genericArgs[k]!,
              );
            }
          }
        } else {
          // Maybe it's a struct constructor?
          // If 'resolvedType' is null or no declaration, we can't morph.
          // But let's assume valid typed AST.
        }
      } else if (expr.resolvedDeclaration) {
        const resolvedDecl = expr.resolvedDeclaration;
        if (resolvedDecl.kind === "Extern") {
          funcName = resolvedDecl.name;
        } else if (
          resolvedDecl.resolvedType &&
          resolvedDecl.resolvedType.kind === "FunctionType"
        ) {
          funcName = this.getMangledName(
            resolvedDecl.name,
            resolvedDecl.resolvedType as AST.FunctionTypeNode,
          );
        } else {
          funcName = decl.name;
        }
      }
    } else if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType;

      if (!objType)
        throw new CompilerError(
          "Member access on unresolved type",
          "The type of the object could not be resolved.",
          memberExpr.location,
        );

      // Handle Bit Manipulation Intrinsics on primitive integers
      if (objType.kind === "BasicType") {
        const resolvedType = this.resolveType(objType);
        if (this.isIntegerType(resolvedType)) {
          const method = memberExpr.property;
          const val = this.generateExpression(memberExpr.object);
          const width = this.getBitWidth(resolvedType);

          if (method === "popCount") {
            const reg = this.newRegister();
            this.emit(
              `  ${reg} = call ${resolvedType} @llvm.ctpop.i${width}(${resolvedType} ${val})`,
            );
            return reg;
          } else if (method === "leadingZeros") {
            const reg = this.newRegister();
            this.emit(
              `  ${reg} = call ${resolvedType} @llvm.ctlz.i${width}(${resolvedType} ${val}, i1 false)`,
            );
            return reg;
          } else if (method === "trailingZeros") {
            const reg = this.newRegister();
            this.emit(
              `  ${reg} = call ${resolvedType} @llvm.cttz.i${width}(${resolvedType} ${val}, i1 false)`,
            );
            return reg;
          } else if (method === "byteSwap") {
            const reg = this.newRegister();
            this.emit(
              `  ${reg} = call ${resolvedType} @llvm.bswap.i${width}(${resolvedType} ${val})`,
            );
            return reg;
          } else if (method === "reverseBits") {
            const reg = this.newRegister();
            this.emit(
              `  ${reg} = call ${resolvedType} @llvm.bitreverse.i${width}(${resolvedType} ${val})`,
            );
            return reg;
          }
        }
      }

      if ((objType as any).kind === "ModuleType") {
        // Module function call (namespace import)
        // Use mangled name based on function signature
        if (
          expr.resolvedDeclaration &&
          expr.resolvedDeclaration.kind === "FunctionDecl"
        ) {
          const funcDecl = expr.resolvedDeclaration as AST.FunctionDecl;
          const funcDeclType = funcDecl.resolvedType as AST.FunctionTypeNode;
          funcName = this.getMangledName(funcDecl.name, funcDeclType);
        } else if (
          expr.resolvedType &&
          expr.resolvedType.kind === "FunctionType"
        ) {
          // Fallback: use function name with type-based mangling
          funcName = this.getMangledName(
            memberExpr.property,
            expr.resolvedType as AST.FunctionTypeNode,
          );
        } else {
          funcName = memberExpr.property;
        }
      } else {
        let structName = "";
        let ownerDecl: AST.StructDecl | null = null;
        let contextMap: Map<string, AST.TypeNode> | undefined;
        let prefix: string | undefined;

        if (objType.kind === "BasicType") {
          // Check if it is a Spec
          let specDecl = this.specMap.get(objType.name);
          if (
            !specDecl &&
            objType.resolvedDeclaration &&
            objType.resolvedDeclaration.kind === "SpecDecl"
          ) {
            specDecl = objType.resolvedDeclaration as AST.SpecDecl;
          }

          if (specDecl) {
            return this.generateSpecMethodCall(expr, memberExpr, specDecl);
          }

          // Use resolved type name to handle monomorphization
          const typeStr = this.resolveType(objType);
          // typeStr is %struct.Box_i32 or %struct.Box
          // we need the clean name

          let cleanType = typeStr;
          // Strip pointers
          while (cleanType.endsWith("*")) {
            cleanType = cleanType.slice(0, -1);
          }
          // Strip arrays [N x ...]
          while (cleanType.startsWith("[")) {
            // Extract inner type "x Inner]"
            const match = cleanType.match(/^\[\d+ x (.+)\]$/);
            if (match) {
              cleanType = match[1]!;
            } else {
              break;
            }
          }

          if (cleanType.startsWith("%struct.")) {
            structName = cleanType.substring(8);
          } else if (cleanType.startsWith("%enum.")) {
            structName = cleanType.substring(6);
          } else if (PRIMITIVE_STRUCT_MAP[objType.name]) {
            structName = PRIMITIVE_STRUCT_MAP[objType.name]!;
            targetThisType = `%struct.${structName}*`;
          } else if (PRIMITIVE_STRUCT_MAP[cleanType]) {
            structName = PRIMITIVE_STRUCT_MAP[cleanType]!;
            targetThisType = `%struct.${structName}*`;
          } else {
            structName = objType.name;
          }

          // Check for inherited method
          ownerDecl = this.findMethodOwner(structName, memberExpr.property);

          if (
            ownerDecl &&
            ownerDecl.name !== (objType as AST.BasicTypeNode).name
          ) {
            // Inherited method
            if (ownerDecl.genericParams.length === 0) {
              // Parent is not generic, use its name directly
              structName = ownerDecl.name;
              targetThisType = `%struct.${structName}*`;
            } else {
              // Generic parent inheritance
              const childDecl = this.structMap.get(
                (objType as AST.BasicTypeNode).name,
              );
              if (childDecl) {
                const parentType = this.findInstantiatedParentType(
                  childDecl,
                  objType as AST.BasicTypeNode,
                  ownerDecl.name,
                );

                if (parentType) {
                  const llvmType = this.resolveMonomorphizedType(
                    ownerDecl,
                    parentType.genericArgs,
                  );
                  structName = llvmType.substring(8); // Strip %struct.
                  targetThisType = `${llvmType}*`;

                  // Populate callSubstitutionMap for generic parent
                  if (ownerDecl.genericParams.length > 0) {
                    for (let i = 0; i < ownerDecl.genericParams.length; i++) {
                      if (i < parentType.genericArgs.length) {
                        callSubstitutionMap.set(
                          ownerDecl.genericParams[i]!.name,
                          parentType.genericArgs[i]!,
                        );
                        // Also populate contextMap for mangling
                        if (!contextMap) contextMap = new Map();
                        contextMap.set(
                          ownerDecl.genericParams[i]!.name,
                          parentType.genericArgs[i]!,
                        );
                      }
                    }
                  }
                }
              }
            }
          }

          decl = expr.resolvedDeclaration;

          // If we found a concrete owner, try to find the method declaration there
          if (ownerDecl) {
            const isDeclaredInOwner =
              decl && ownerDecl.members.includes(decl as any);

            if (!isDeclaredInOwner) {
              const candidates = ownerDecl.members.filter(
                (m) =>
                  m.kind === "FunctionDecl" && m.name === memberExpr.property,
              ) as AST.FunctionDecl[];

              if (candidates.length === 1) {
                decl = candidates[0];
              } else if (
                candidates.length > 1 &&
                decl &&
                decl.kind === "FunctionDecl"
              ) {
                const targetParams = (decl as AST.FunctionDecl).params;
                const targetParamTypes = targetParams
                  .slice(1)
                  .map((p) => p.type);

                const match = candidates.find((c) => {
                  if (
                    c.genericParams.length !==
                    (decl as AST.FunctionDecl).genericParams.length
                  )
                    return false;

                  const cParams = c.params.slice(1).map((p) => p.type);
                  if (cParams.length !== targetParamTypes.length) return false;
                  return cParams.every(
                    (t, i) =>
                      this.resolveType(t) ===
                      this.resolveType(targetParamTypes[i]!),
                  );
                });

                if (match) {
                  decl = match;
                }
              }
            }
          }

          // Check for virtual method dispatch
          // Only for instance calls (not static calls like Struct.new())
          // And only if the struct has a vtable

          if (this.vtableLayouts.has(structName)) {
            const layout = this.vtableLayouts.get(structName)!;

            let lookupName = memberExpr.property;
            // Try to resolve specific overload using resolvedDeclaration
            // Use 'decl' if available (it might be the concrete implementation found in owner)
            const targetDecl =
              (decl as AST.FunctionDecl) ||
              (expr.resolvedDeclaration as AST.FunctionDecl);

            if (targetDecl && targetDecl.kind === "FunctionDecl") {
              if (
                targetDecl.resolvedType &&
                targetDecl.resolvedType.kind === "FunctionType"
              ) {
                let typeToMangle =
                  targetDecl.resolvedType as AST.FunctionTypeNode;
                if (callSubstitutionMap.size > 0) {
                  typeToMangle = this.substituteType(
                    typeToMangle,
                    callSubstitutionMap,
                  ) as AST.FunctionTypeNode;
                }
                // Use VTable naming convention (skip 'this' parameter).
                // The VTable keys are generated using `getVTableMethodName` in TypeGenerator,
                // which explicitly skips the first parameter (this) to create a consistent key
                // regardless of the specific 'this' type (e.g. Parent* vs Child*).
                const paramTypes = typeToMangle.paramTypes.slice(1);
                const mangledParams = paramTypes
                  .map((t) => this.mangleType(t))
                  .join("_");
                lookupName = `${targetDecl.name}_${mangledParams}`;
              }
            }

            const methodIndex = layout.indexOf(lookupName);

            if (methodIndex !== -1) {
              // It is a virtual method!
              // We need to handle arguments generation here because generateVirtualCall takes expressions.
              // argsToGenerate is already set to [memberExpr.object, ...expr.args] for instance calls?
              // No, argsToGenerate is initialized to expr.args.
              // But for virtual call, we pass expr.args to generateVirtualCall, and it handles 'this' (memberExpr.object).
              // So we pass expr.args.

              return this.generateVirtualCall(
                expr,
                memberExpr,
                structName,
                methodIndex,
                expr.args,
              );
            }
          }

          prefix = structName; // e.g. Box_double

          // Instance call: pass object as first argument
          argsToGenerate = [memberExpr.object, ...expr.args];
          isInstanceCall = true;

          // Prepare context if object is instantiated generic struct
          let structDecl = this.structMap.get(objType.name); // Original generic struct
          if (!structDecl) {
            structDecl = this.enumDeclMap.get(objType.name) as any;
          }

          if (
            structDecl &&
            structDecl.genericParams.length > 0 &&
            objType.genericArgs.length > 0
          ) {
            // Force generation of the monomorphized struct and its methods
            // This is crucial if the struct was only used as a pointer before (e.g. *Array<int>)
            // and thus skipped generation, but now we are calling a method on it.
            if (structDecl.kind === "StructDecl") {
              const substitutedArgs = objType.genericArgs.map((arg) =>
                this.substituteType(arg, this.currentTypeMap),
              );
              // We pass undefined for skipGeneration to let it auto-detect placeholders.
              // If args are concrete, it will generate the struct and methods.
              this.resolveMonomorphizedType(
                structDecl as AST.StructDecl,
                substitutedArgs,
              );
            }

            contextMap = new Map();
            for (let i = 0; i < structDecl.genericParams.length; i++) {
              if (i < objType.genericArgs.length) {
                let genericArg = objType.genericArgs[i]!;
                // Substitute any generic parameters in the argument using currentTypeMap
                // This handles cases like Array<Pair<K, V>> where K, V need to be resolved
                if (this.currentTypeMap.size > 0) {
                  genericArg = this.substituteType(
                    genericArg,
                    this.currentTypeMap,
                  );
                }
                contextMap.set(structDecl.genericParams[i]!.name, genericArg);
                callSubstitutionMap.set(
                  structDecl.genericParams[i]!.name,
                  genericArg,
                );
              }
            }
          }
        } else if (objType.kind === "MetaType") {
          const inner = (objType as any).type;
          if (inner.kind === "BasicType") {
            structName = inner.name;

            // Handle generic static calls - need monomorphized name
            if (inner.genericArgs && inner.genericArgs.length > 0) {
              // Resolve the monomorphized struct name
              let structDecl = this.structMap.get(inner.name);
              if (!structDecl) {
                // Check enum map
                const enumDecl = this.enumDeclMap.get(inner.name);
                if (enumDecl) {
                  // Treat enum as struct for generic param lookup
                  structDecl = enumDecl as any;
                }
              }

              if (structDecl && structDecl.genericParams.length > 0) {
                // Build contextMap for generic substitution
                contextMap = new Map();
                for (let i = 0; i < structDecl.genericParams.length; i++) {
                  if (i < inner.genericArgs.length) {
                    let genericArg = inner.genericArgs[i]!;
                    // Substitute any generic parameters in the argument using currentTypeMap
                    // This handles cases like Option<V> where V needs to be resolved to concrete type
                    if (this.currentTypeMap.size > 0) {
                      genericArg = this.substituteType(
                        genericArg,
                        this.currentTypeMap,
                      );
                    }
                    contextMap.set(
                      structDecl.genericParams[i]!.name,
                      genericArg,
                    );
                    callSubstitutionMap.set(
                      structDecl.genericParams[i]!.name,
                      genericArg,
                    );
                  }
                }

                // Mangle the struct name using the same approach as resolveMonomorphizedType
                // But first substitute any generic parameters
                const substitutedArgs = inner.genericArgs.map(
                  (arg: AST.TypeNode) =>
                    this.substituteType(arg, this.currentTypeMap),
                );
                const argNames = substitutedArgs
                  .map((arg: AST.TypeNode) => this.mangleType(arg))
                  .join("_");
                structName = `${inner.name}_${argNames}`;
                prefix = structName;
              }
            }

            ownerDecl = this.findMethodOwner(structName, memberExpr.property);
            if (!ownerDecl && memberExpr.property.includes("toString")) {
              codeGenLog.debug(
                `DEBUG: findMethodOwner failed for ${structName}.${memberExpr.property}. Try looking for Type.`,
              );
            }

            // Static call: no extra argument
          } else {
            throw new CompilerError(
              "Static member access on non-struct type",
              "Static members can only be accessed on struct types.",
              memberExpr.location,
            );
          }
        } else {
          throw new CompilerError(
            "Member access on non-struct type",
            "Members can only be accessed on struct types.",
            memberExpr.location,
          );
        }

        funcName = `${structName}_${memberExpr.property}`;

        if (
          !decl &&
          callee.resolvedType &&
          (callee.resolvedType as any).declaration
        ) {
          decl = (callee.resolvedType as any).declaration;
        }

        if (decl) {
          if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
            let funcTypeToMangle = decl.resolvedType as AST.FunctionTypeNode;
            // Substitute generic types before mangling
            // Merge currentTypeMap and contextMap to handle nested generics
            // e.g., calling Array<Pair<K, V>>.destroy() needs both T->Pair and K,V mappings
            const substitutionMap = new Map<string, AST.TypeNode>();
            if (this.currentTypeMap.size > 0) {
              for (const [k, v] of this.currentTypeMap) {
                substitutionMap.set(k, v);
              }
            }
            if (contextMap) {
              for (const [k, v] of contextMap) {
                // contextMap takes precedence for the target type's generics
                substitutionMap.set(k, v);
              }
            }
            if (substitutionMap.size > 0) {
              funcTypeToMangle = this.substituteType(
                funcTypeToMangle,
                substitutionMap,
              ) as AST.FunctionTypeNode;
            }
            funcName = this.getMangledName(funcName, funcTypeToMangle);
          }
        }

        // Handle generic method call
        if (genericArgs.length > 0) {
          const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
          if (funcType && funcType.declaration) {
            funcName = this.resolveMonomorphizedFunction(
              funcType.declaration,
              genericArgs,
              contextMap,
              prefix,
            );
            if (
              funcType.declaration.genericParams.length === genericArgs.length
            ) {
              for (let k = 0; k < genericArgs.length; k++) {
                callSubstitutionMap.set(
                  funcType.declaration.genericParams[k]!.name,
                  genericArgs[k]!,
                );
              }
            }
          }
        }
      }
    }
    let callTarget = "";
    let closureCtx = "null";
    let isClosureCall = false; // Track if we need to pass context argument
    let _isIndirectCall = false;

    // If identifier and local, indirect call
    if (callee.kind === "Identifier") {
      const ident = callee as AST.IdentifierExpr;
      if (this.locals.has(ident.name)) {
        // Indirect call
        _isIndirectCall = true;
        const type = ident.resolvedType!;

        if (type.kind === "FunctionType" || type.kind === "LambdaType") {
          // Fat function pointer / Closure or Raw Function Variable
          const valType = this.resolveType(type);
          const addr = this.generateAddress(ident);
          const val = this.newRegister();
          // addr is valType*
          this.emit(`  ${val} = load ${valType}, ${valType}* ${addr}`);

          if (type.kind === "LambdaType") {
            const funcPtr = this.newRegister();
            this.emit(`  ${funcPtr} = extractvalue ${valType} ${val}, 0`);
            callTarget = funcPtr;

            const ctxPtr = this.newRegister();
            this.emit(`  ${ctxPtr} = extractvalue ${valType} ${val}, 1`);
            closureCtx = ctxPtr;
            isClosureCall = true;
          } else {
            // FunctionType is raw pointer
            callTarget = val;
            isClosureCall = false;
          }
        }
      } else {
        callTarget = `@${funcName}`;
      }
    } else if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType as AST.BasicTypeNode;
      if (objType && objType.kind === "BasicType") {
        let structName = objType.name;
        if (this.currentTypeMap.has(structName)) {
          const typeStr = this.resolveType(objType); // %struct.Name
          if (typeStr.startsWith("%struct.")) {
            structName = typeStr.substring(8);
            while (structName.endsWith("*"))
              structName = structName.slice(0, -1);
          }
        }

        // Check layout
        const layout = this.structLayouts.get(structName);
        if (layout && layout.has(memberExpr.property)) {
          // It IS a field! Indirect call.
          _isIndirectCall = true;
          const type = memberExpr.resolvedType!;

          if (type.kind === "FunctionType" || type.kind === "LambdaType") {
            // Fat function / Closure field or Raw Function field
            const val = this.generateMember(memberExpr); // Get value
            const valType = this.resolveType(memberExpr.resolvedType!);

            if (type.kind === "LambdaType") {
              const funcPtr = this.newRegister();
              this.emit(`  ${funcPtr} = extractvalue ${valType} ${val}, 0`);
              callTarget = funcPtr;

              const ctxPtr = this.newRegister();
              this.emit(`  ${ctxPtr} = extractvalue ${valType} ${val}, 1`);
              closureCtx = ctxPtr;
              isClosureCall = true;
            } else {
              // FunctionType is a raw pointer
              callTarget = val;
              isClosureCall = false;
            }
          }

          // Reset args (remove "this" injection done for methods)
          if (isInstanceCall) {
            argsToGenerate = expr.args; // Revert to original args
            isInstanceCall = false;
          }
        } else {
          // Method call
          const useVirtualCall = false;

          if (useVirtualCall) {
            // Generate indirect call via vtable
            const objExpr = argsToGenerate[0]!;
            let objPtr: string;
            const objTypeStr = this.resolveType(objExpr.resolvedType!);
            if (objTypeStr.endsWith("*")) {
              objPtr = this.generateExpression(objExpr);
            } else {
              try {
                objPtr = this.generateAddress(objExpr);
              } catch {
                // Spill to stack
                const val = this.generateExpression(objExpr);
                const spill = this.allocateStack(
                  `vcall_spill_${this.labelCount++}`,
                  objTypeStr,
                );
                this.emit(
                  `  store ${objTypeStr} ${val}, ${objTypeStr}* ${spill}`,
                );
                objPtr = spill;
              }
            }

            const vtableIndex = this.structLayouts
              .get(structName)
              ?.get("__vtable__");

            if (vtableIndex !== undefined) {
              const vptrPtr = this.newRegister();
              const structType = objTypeStr.endsWith("*")
                ? objTypeStr.slice(0, -1)
                : objTypeStr;

              this.emit(
                `  ${vptrPtr} = getelementptr inbounds ${structType}, ${structType}* ${objPtr}, i32 0, i32 ${vtableIndex}`,
              );

              const vptr = this.newRegister();
              this.emit(`  ${vptr} = load i8*, i8** ${vptrPtr}`);

              const vtableArrayPtr = this.newRegister();
              this.emit(`  ${vtableArrayPtr} = bitcast i8* ${vptr} to i8**`);

              const vtableMethods = this.vtableLayouts.get(structName)!;
              const methodIndex = vtableMethods.indexOf(memberExpr.property);
              const funcPtrPtr = this.newRegister();
              this.emit(
                `  ${funcPtrPtr} = getelementptr inbounds i8*, i8** ${vtableArrayPtr}, i64 ${methodIndex}`,
              );

              const funcPtrI8 = this.newRegister();
              this.emit(`  ${funcPtrI8} = load i8*, i8** ${funcPtrPtr}`);

              const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
              // We need the raw function pointer type, not the closure struct type
              const retType = this.resolveType(funcType.returnType);
              const paramTypes = funcType.paramTypes.map((p) =>
                this.resolveType(p),
              );
              const paramsStr =
                paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
              const targetFuncType = `${retType} (i8*${paramsStr})*`;

              const funcPtr = this.newRegister();
              this.emit(
                `  ${funcPtr} = bitcast i8* ${funcPtrI8} to ${targetFuncType}`,
              );

              callTarget = funcPtr;
            } else {
              callTarget = `@${funcName}`;
            }
          } else {
            callTarget = `@${funcName}`;
          }
        }
      } else {
        callTarget = `@${funcName}`;
      }
    } else {
      // Other expressions (Index, Call, etc) evaluating to closure struct or func ptr
      // e.g. arr[0]()
      _isIndirectCall = true;
      const type = callee.resolvedType!;

      if (type.kind === "FunctionType" || type.kind === "LambdaType") {
        const valType = this.resolveType(callee.resolvedType!);
        const val = this.generateExpression(callee);

        if (type.kind === "LambdaType") {
          const funcPtr = this.newRegister();
          this.emit(`  ${funcPtr} = extractvalue ${valType} ${val}, 0`);
          callTarget = funcPtr;

          const ctxPtr = this.newRegister();
          this.emit(`  ${ctxPtr} = extractvalue ${valType} ${val}, 1`);
          closureCtx = ctxPtr;
          isClosureCall = true;
        } else {
          callTarget = val;
          isClosureCall = false;
        }
      }
    }

    const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
    if (!funcType) {
      throw new CompilerError(
        `Function call '${funcName}' has no resolved type`,
        "Internal compiler error: function type not resolved.",
        expr.location,
      );
    }

    if (
      funcType.declaration &&
      (funcType.declaration as any).kind === "SpecMethod"
    ) {
      if (isInstanceCall) {
        const memberExpr = callee as AST.MemberExpr;
        const objType = memberExpr.object.resolvedType;
        if (objType) {
          callSubstitutionMap.set("Self", objType);
        }
      }
    }

    // Try to find the actual method declaration in the owner struct (for inheritance)
    let targetMethodDecl: AST.FunctionDecl | undefined;
    if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType;
      if (objType && objType.kind === "BasicType") {
        let structName = objType.name;
        // Handle monomorphized name resolution if needed
        if (this.currentTypeMap.has(structName)) {
          const typeStr = this.resolveType(objType);
          if (typeStr.startsWith("%struct.")) {
            structName = typeStr.substring(8);
            while (structName.endsWith("*"))
              structName = structName.slice(0, -1);
          }
        }

        const ownerDecl = this.findMethodOwner(structName, memberExpr.property);
        if (ownerDecl) {
          const member = ownerDecl.members.find(
            (mem) =>
              mem.kind === "FunctionDecl" && mem.name === memberExpr.property,
          );
          if (member) targetMethodDecl = member as AST.FunctionDecl;
        }
      }
    }

    const generateArg = (arg: AST.Expression, i: number): string => {
      let targetTypeNode: AST.TypeNode | undefined;

      if (isInstanceCall) {
        if (i === 0) {
          if (targetMethodDecl && targetMethodDecl.params.length > 0) {
            targetTypeNode = targetMethodDecl.params[0]!.type;
          } else if (
            funcType.declaration &&
            funcType.declaration.params.length > 0
          ) {
            targetTypeNode = funcType.declaration.params[0]!.type;
          } else {
            targetTypeNode = arg.resolvedType;
          }
        } else if (i - 1 < funcType.paramTypes.length) {
          targetTypeNode = funcType.paramTypes[i - 1];
        }
      } else if (i < funcType.paramTypes.length) {
        targetTypeNode = funcType.paramTypes[i];
      }

      if (targetTypeNode) {
        // Apply substitution
        if (callSubstitutionMap.size > 0) {
          targetTypeNode = this.substituteType(
            targetTypeNode,
            callSubstitutionMap,
          );
        }

        const destType = this.resolveType(targetTypeNode);

        // Treat function identifiers as FunctionType even if TypeChecker resolved them to BasicType (e.g. implicitly)
        let resolvedArgType = arg.resolvedType!;

        if (
          arg.kind === "Identifier" &&
          arg.resolvedDeclaration &&
          arg.resolvedDeclaration.kind === "FunctionDecl"
        ) {
          const fnDecl = arg.resolvedDeclaration as AST.FunctionDecl;
          resolvedArgType = {
            kind: "FunctionType",
            returnType: fnDecl.returnType,
            paramTypes: fnDecl.params.map((p) => p.type),
            declaration: fnDecl,
            isVariadic: false,
            location: arg.location,
          };
        }

        const srcType = this.resolveType(resolvedArgType);

        if (
          targetTypeNode &&
          targetTypeNode.kind === "LambdaType" &&
          resolvedArgType.kind === "FunctionType"
        ) {
          const val = this.generateExpression(arg);
          const expectedFuncPtrType = destType
            .substring(destType.indexOf("{") + 1, destType.lastIndexOf(","))
            .trim();

          const castReg = this.newRegister();
          this.emit(
            `  ${castReg} = bitcast ${srcType} ${val} to ${expectedFuncPtrType}`,
          );

          const undef = this.newRegister();
          this.emit(
            `  ${undef} = insertvalue ${destType} undef, ${expectedFuncPtrType} ${castReg}, 0`,
          );

          const result = this.newRegister();
          this.emit(
            `  ${result} = insertvalue ${destType} ${undef}, i8* null, 1`,
          );

          return `${destType} ${result}`;
        }

        // Check for Struct* -> Spec* cast
        if (targetTypeNode.kind === "BasicType") {
          let specDecl = this.specMap.get(targetTypeNode.name);
          if (
            !specDecl &&
            targetTypeNode.resolvedDeclaration &&
            targetTypeNode.resolvedDeclaration.kind === "SpecDecl"
          ) {
            specDecl = targetTypeNode.resolvedDeclaration as AST.SpecDecl;
          }

          if (specDecl) {
            // It is a spec!
            // Check if arg is a struct pointer
            const argType = resolvedArgType;
            if (argType.kind === "BasicType" && argType.pointerDepth === 1) {
              // Check if it's a struct
              let structDecl = this.structMap.get(argType.name);
              if (
                !structDecl &&
                argType.resolvedDeclaration &&
                argType.resolvedDeclaration.kind === "StructDecl"
              ) {
                structDecl = argType.resolvedDeclaration as AST.StructDecl;
              }

              if (structDecl) {
                // Generate fat pointer
                const structType = { ...argType, pointerDepth: 0 };
                const vtableName = this.getOrGenerateSpecVTable(
                  structType,
                  targetTypeNode,
                );

                // Allocate fat pointer on stack
                const fatPtr = this.allocateStack(
                  `fat_ptr_${this.labelCount++}`,
                  "{ i8*, i8* }",
                );

                // Store data pointer (cast to i8*)
                const dataPtrPtr = this.newRegister();
                this.emit(
                  `  ${dataPtrPtr} = getelementptr inbounds { i8*, i8* }, { i8*, i8* }* ${fatPtr}, i32 0, i32 0`,
                );

                const srcVal = this.generateExpression(arg); // This is the struct pointer
                const srcVoidPtr = this.newRegister();
                this.emit(
                  `  ${srcVoidPtr} = bitcast ${srcType} ${srcVal} to i8*`,
                );
                this.emit(`  store i8* ${srcVoidPtr}, i8** ${dataPtrPtr}`);

                // Store vtable pointer (cast to i8*)
                const vtablePtrPtr = this.newRegister();
                this.emit(
                  `  ${vtablePtrPtr} = getelementptr inbounds { i8*, i8* }, { i8*, i8* }* ${fatPtr}, i32 0, i32 1`,
                );

                const vtableSize = this.getAllSpecMethods(specDecl).length;
                const vtableType = `[${vtableSize} x i8*]`;
                const vtableGlobal = `@${vtableName}`;

                const vtableVoidPtr = this.newRegister();
                this.emit(
                  `  ${vtableVoidPtr} = bitcast ${vtableType}* ${vtableGlobal} to i8*`,
                );
                this.emit(`  store i8* ${vtableVoidPtr}, i8** ${vtablePtrPtr}`);

                return `{ i8*, i8* }* ${fatPtr}`;
              }
            }
          }
        }

        // Handle 'this' pointer cast for inherited methods
        if (
          isInstanceCall &&
          i === 0 &&
          targetThisType &&
          srcType !== targetThisType
        ) {
          // Check if we are casting a primitive to its wrapper struct
          // e.g. i32 -> %struct.Int*
          let wrapperStructName = "";
          if (
            targetThisType.startsWith("%struct.") &&
            targetThisType.endsWith("*")
          ) {
            wrapperStructName = targetThisType.substring(
              8,
              targetThisType.length - 1,
            );
          }

          // Check if this is a primitive wrapper cast
          let isMatch = false;
          if (wrapperStructName) {
            if (PRIMITIVE_STRUCT_MAP[srcType] === wrapperStructName) {
              isMatch = true;
            } else {
              // Check reverse mapping for unsigned types etc.
              for (const [key, val] of Object.entries(PRIMITIVE_STRUCT_MAP)) {
                if (val === wrapperStructName) {
                  let keyLLVM = "";
                  switch (key) {
                    case "i8":
                    case "u8":
                    case "char":
                    case "uchar":
                      keyLLVM = "i8";
                      break;
                    case "i16":
                    case "u16":
                    case "short":
                    case "ushort":
                      keyLLVM = "i16";
                      break;
                    case "i32":
                    case "u32":
                    case "int":
                    case "uint":
                      keyLLVM = "i32";
                      break;
                    case "i64":
                    case "u64":
                    case "long":
                    case "ulong":
                      keyLLVM = "i64";
                      break;
                    case "float":
                    case "double":
                      keyLLVM = "double";
                      break;
                    case "bool":
                    case "i1":
                      keyLLVM = "i1";
                      break;
                  }
                  if (keyLLVM === srcType) {
                    isMatch = true;
                    break;
                  }
                }
              }
            }
          }

          if (isMatch) {
            // Construct temporary wrapper struct
            const structType = `%struct.${wrapperStructName}`;
            const tempStructPtr = this.allocateStack(
              `primitive_wrapper_${this.labelCount++}`,
              structType,
            );

            // Initialize struct
            const layout = this.structLayouts.get(wrapperStructName);
            if (layout) {
              // Set value
              const valueIndex = layout.get("value");
              if (valueIndex !== undefined) {
                const val = this.generateExpression(arg);
                const valPtr = this.newRegister();
                this.emit(
                  `  ${valPtr} = getelementptr inbounds ${structType}, ${structType}* ${tempStructPtr}, i32 0, i32 ${valueIndex}`,
                );
                this.emit(`  store ${srcType} ${val}, ${srcType}* ${valPtr}`);
              }

              // Set vtable if needed
              const vtableIndex = layout.get("__vtable__");
              if (vtableIndex !== undefined) {
                const vtableGlobal =
                  this.vtableGlobalNames.get(wrapperStructName);
                if (vtableGlobal) {
                  const methods = this.vtableLayouts.get(wrapperStructName)!;
                  const arrayType = `[${methods.length} x i8*]`;

                  const vtablePtr = this.newRegister();
                  this.emit(
                    `  ${vtablePtr} = getelementptr inbounds ${structType}, ${structType}* ${tempStructPtr}, i32 0, i32 ${vtableIndex}`,
                  );

                  const vtableCast = this.newRegister();
                  this.emit(
                    `  ${vtableCast} = bitcast ${arrayType}* ${vtableGlobal} to i8*`,
                  );
                  this.emit(`  store i8* ${vtableCast}, i8** ${vtablePtr}`);
                }
              }
            }

            return `${targetThisType} ${tempStructPtr}`;
          }

          let ptrVal: string;
          let ptrType: string;

          if (srcType.endsWith("*")) {
            ptrVal = this.generateExpression(arg);
            ptrType = srcType;
          } else {
            // Try to get address
            try {
              ptrVal = this.generateAddress(arg);
              ptrType = srcType + "*";
            } catch {
              // Spill to stack
              const val = this.generateExpression(arg);
              const spill = this.allocateStack(
                `spill_${this.labelCount++}`,
                srcType,
              );
              this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);
              ptrVal = spill;
              ptrType = srcType + "*";
            }
          }

          const castReg = this.newRegister();
          this.emit(
            `  ${castReg} = bitcast ${ptrType} ${ptrVal} to ${targetThisType}`,
          );

          // Check if the function expects a value or a pointer
          if (destType === targetThisType) {
            return `${targetThisType} ${castReg}`;
          } else if (targetThisType === destType + "*") {
            // Function expects value, load it from the casted pointer
            const loaded = this.newRegister();
            this.emit(
              `  ${loaded} = load ${destType}, ${targetThisType} ${castReg}`,
            );
            return `${destType} ${loaded}`;
          }
          // Fallback: return casted pointer (might be wrong if types don't match, but better than nothing)
          return `${targetThisType} ${castReg}`;
        }

        // Optimize for L-values passing to pointer: take address directly (T -> *T)
        if (destType === srcType + "*") {
          try {
            const addr = this.generateAddress(arg as any);
            return `${destType} ${addr}`;
          } catch {
            // R-value passed where pointer expected: spill to stack
            const val = this.generateExpression(arg);
            const spill = this.allocateStack(
              `arg_spill_${this.labelCount++}`,
              srcType,
            );
            this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);
            return `${destType} ${spill}`;
          }
        }

        if (srcType.startsWith("[") && destType.endsWith("*")) {
          if (
            arg.kind === "Identifier" ||
            arg.kind === "Member" ||
            arg.kind === "Index"
          ) {
            const addr = this.generateAddress(arg as any);

            const decayReg = this.newRegister();
            this.emit(
              `  ${decayReg} = getelementptr inbounds ${srcType}, ${srcType}* ${addr}, i64 0, i64 0`,
            );
            return `${destType} ${decayReg}`;
          }
          // Handle R-value arrays (ArrayLiteral) by spilling to stack
          const val = this.generateExpression(arg);
          const spill = this.allocateStack(
            `array_lit_${this.labelCount++}`,
            srcType,
          );
          this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);

          const decayReg = this.newRegister();
          this.emit(
            `  ${decayReg} = getelementptr inbounds ${srcType}, ${srcType}* ${spill}, i64 0, i64 0`,
          );
          return `${destType} ${decayReg}`;
        }

        const val = this.generateExpression(arg);

        const castVal = this.emitCast(
          val,
          srcType,
          destType,
          resolvedArgType,
          targetTypeNode,
        );
        return `${destType} ${castVal}`;
      }

      const val = this.generateExpression(arg);
      const srcType = this.resolveType(arg.resolvedType!);

      // Special handling for String passed to variadic function (like printf)
      if (funcType.isVariadic && srcType === "%struct.String") {
        const strData = this.newRegister();
        this.emit(`  ${strData} = extractvalue %struct.String ${val}, 0`);
        return `i8* ${strData}`;
      }

      // For variadic arguments, promote i1 to i32 (C convention)
      if (srcType === "i1" && funcType.isVariadic) {
        const promoted = this.newRegister();
        this.emit(`  ${promoted} = zext i1 ${val} to i32`);
        return `i32 ${promoted}`;
      }

      return `${srcType} ${val}`;
    };

    let args: string;
    const isVariadic = funcType.isVariadic === true;
    const isExtern =
      expr.resolvedDeclaration && expr.resolvedDeclaration.kind === "Extern";

    // Check if this is a module function call (namespace import)
    const isModuleFunction =
      callee.kind === "Member" &&
      (callee as AST.MemberExpr).object.resolvedType &&
      ((callee as AST.MemberExpr).object.resolvedType as any).kind ===
        "ModuleType";

    if (isVariadic && !isExtern && !(expr as any).variadicPacked) {
      // BPL Variadic Logic
      let fixedCount = 0;
      let variadicParamType: AST.TypeNode | undefined;

      if (funcType.declaration && (funcType.declaration as any).params) {
        const params = (funcType.declaration as any).params;
        const variadicIndex = params.findIndex((p: any) => p.isVariadic);
        if (variadicIndex !== -1) {
          fixedCount = variadicIndex;
          variadicParamType = params[variadicIndex].type;
        } else {
          // Fallback if isVariadic is true but no param marked (shouldn't happen)
          fixedCount = funcType.paramTypes.length - 1;
        }
      } else if (funcType.paramTypes.length >= 2) {
        // Fallback for function pointers etc.
        // Assume standard BPL variadic: (...args, count) -> 2 extra params in signature compared to fixed args
        // If signature is (a, b, ...args, count), paramTypes is [a, b, args, count].
        // fixedCount should be 2. Length is 4. So length - 2.
        fixedCount = funcType.paramTypes.length - 2;
        variadicParamType = funcType.paramTypes[fixedCount];
      } else {
        fixedCount = 0;
      }

      const fixedArgs = argsToGenerate.slice(0, fixedCount);
      const varArgs = argsToGenerate.slice(fixedCount);

      const fixedArgStrs = fixedArgs.map((arg, i) => generateArg(arg, i));

      // Determine if homogeneous
      let isHomogeneous = false;
      let elementType = "%struct.Any";

      if (variadicParamType) {
        if (
          variadicParamType.kind === "BasicType" &&
          variadicParamType.name === "Any"
        ) {
          isHomogeneous = false;
        } else {
          isHomogeneous = true;
          elementType = this.resolveType(variadicParamType);
        }
      }

      // Ensure Any struct is defined before we use it in variadic arrays
      if (!isHomogeneous && !this.generatedStructs.has("Any")) {
        this.declarationsOutput.push(
          `%struct.Any = type { %struct.TypeInfo*, i64 }`,
        );
        this.generatedStructs.add("Any");
      }

      // Pack varArgs
      const count = varArgs.length;
      const arrayType = `[${count} x ${elementType}]`;
      const arrayPtr = this.allocateStack(
        `varargs_${this.labelCount++}`,
        arrayType,
      );

      for (let i = 0; i < count; i++) {
        const arg = varArgs[i]!;

        const val = this.generateExpression(arg);
        const srcType = this.resolveType(arg.resolvedType!);

        if (!isHomogeneous) {
          const anyVal = this.generateAnyConstruction(
            val,
            srcType,
            arg.resolvedType!,
          );

          const elemPtr = this.newRegister();
          this.emit(
            `  ${elemPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 ${i}`,
          );
          this.emit(`  store %struct.Any ${anyVal}, %struct.Any* ${elemPtr}`);
        } else {
          // Homogeneous packing
          // Use proper cast generation logic if types differ
          let finalVal = val;
          if (srcType !== elementType) {
            finalVal = this.emitCast(
              val,
              srcType,
              elementType,
              arg.resolvedType!,
              variadicParamType!,
            );
          }

          const elemPtr = this.newRegister();
          this.emit(
            `  ${elemPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 ${i}`,
          );
          this.emit(
            `  store ${elementType} ${finalVal}, ${elementType}* ${elemPtr}`,
          );
        }
      }

      const anyPtr = this.newRegister();
      this.emit(
        `  ${anyPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 0`,
      );

      fixedArgStrs.push(`${elementType}* ${anyPtr}`);
      fixedArgStrs.push(`i64 ${count}`);

      args = fixedArgStrs.join(", ");
    } else {
      args = argsToGenerate.map((arg, i) => generateArg(arg, i)).join(", ");
    }

    // Prepend closure context if needed
    let finalArgs = args;
    const isMain = funcName === "main";

    if (!isExtern && !isMain && isClosureCall) {
      if (finalArgs.length > 0) {
        finalArgs = `i8* ${closureCtx}, ${finalArgs}`;
      } else {
        finalArgs = `i8* ${closureCtx}`;
      }
    }

    const retType = this.resolveType(expr.resolvedType!);

    if (callTarget.startsWith("@") && (isExtern || isModuleFunction)) {
      const targetName = callTarget.substring(1);
      if (
        !this.declaredFunctions.has(targetName) &&
        !this.definedFunctions.has(targetName) &&
        !this.globals.has(targetName) &&
        !this.locals.has(targetName)
      ) {
        // Emit declaration
        const paramTypes: string[] = [];

        if (isInstanceCall) {
          const memberExpr = callee as AST.MemberExpr;
          const objType = memberExpr.object.resolvedType!;
          let thisType = this.resolveType(objType);

          // Check if the function expects a pointer or value for 'this'
          const funcDecl = expr.resolvedDeclaration as AST.FunctionDecl;
          let expectsPointer = true; // Default to pointer

          if (
            funcDecl &&
            funcDecl.params.length > 0 &&
            funcDecl.params[0]!.name === "this"
          ) {
            let thisParamType = funcDecl.params[0]!.type;
            if (callSubstitutionMap.size > 0) {
              thisParamType = this.substituteType(
                thisParamType,
                callSubstitutionMap,
              );
            }
            const resolvedThisParamType = this.resolveType(thisParamType);
            expectsPointer = resolvedThisParamType.endsWith("*");
          }

          if (expectsPointer) {
            // Pass struct by pointer
            if (!thisType.endsWith("*")) {
              thisType += "*";
            }
          }
          paramTypes.push(thisType);
        }

        paramTypes.push(
          ...funcType.paramTypes.map((t, _i) => {
            let resolved = t;
            if (callSubstitutionMap.size > 0) {
              resolved = this.substituteType(t, callSubstitutionMap);
            }

            if (
              resolved.kind === "BasicType" &&
              resolved.genericArgs.length > 0
            ) {
              const structDecl = this.structMap.get(resolved.name);
              if (structDecl) {
                let ret = this.resolveMonomorphizedType(
                  structDecl,
                  resolved.genericArgs,
                );
                for (let i = 0; i < resolved.pointerDepth; i++) ret += "*";

                // Handle BPL variadic signature
                if (funcType.isVariadic && !isExtern) {
                  return `${ret}*, i32`;
                }
                return ret;
              }
            }

            const typeStr = this.resolveType(resolved);
            // Handle BPL variadic signature
            if (funcType.isVariadic && !isExtern) {
              return `${typeStr}*, i32`;
            }
            return typeStr;
          }),
        );

        const substitutedRet =
          callSubstitutionMap.size > 0
            ? this.substituteType(funcType.returnType, callSubstitutionMap)
            : funcType.returnType;

        let retTypeStr: string;
        if (
          substitutedRet.kind === "BasicType" &&
          substitutedRet.genericArgs.length > 0
        ) {
          // Try to resolve monomorphized type directly to avoid resolveType issues with empty map
          const structDecl = this.structMap.get(substitutedRet.name);
          if (structDecl) {
            retTypeStr = this.resolveMonomorphizedType(
              structDecl,
              substitutedRet.genericArgs,
            );
            // Add pointer depth
            for (let i = 0; i < substitutedRet.pointerDepth; i++)
              retTypeStr += "*";
          } else {
            retTypeStr = this.resolveType(substitutedRet);
          }
        } else {
          retTypeStr = this.resolveType(substitutedRet);
        }

        // Check if function is already declared or defined
        if (
          !this.declaredFunctions.has(targetName) &&
          !this.definedFunctions.has(targetName)
        ) {
          let funcDecl = `declare ${retTypeStr} @${targetName}(${paramTypes.join(", ")}`;
          if (funcType.isVariadic && isExtern) {
            if (paramTypes.length > 0) funcDecl += ", ...";
            else funcDecl += "...";
          }
          funcDecl += ")";

          // Check if this is a method of Type struct, which is defined internally
          if (!targetName.startsWith("Type_")) {
            this.emitDeclaration(funcDecl);
            this.declaredFunctions.add(targetName);
          }
        }
      }
    }

    if (retType === "void") {
      if (isVariadic) {
        // Build the full signature for variadic functions
        let paramTypesStr = funcType.paramTypes
          .map((t) => this.resolveType(t))
          .join(", ");

        if (!isExtern && !isMain && isClosureCall) {
          if (paramTypesStr.length > 0) {
            paramTypesStr = `i8*, ${paramTypesStr}`;
          } else {
            paramTypesStr = `i8*`;
          }
        }

        if (isExtern) {
          this.emit(
            `  call void (${paramTypesStr}, ...) ${callTarget}(${finalArgs})`,
          );
        } else {
          this.emit(
            `  call void (${paramTypesStr}) ${callTarget}(${finalArgs})`,
          );
        }
      } else {
        this.emit(`  call void ${callTarget}(${finalArgs})`);
      }
      return "";
    }
    const reg = this.newRegister();
    if (isVariadic) {
      // Build the full signature for variadic functions
      let paramTypesStr = funcType.paramTypes
        .map((t) => this.resolveType(t))
        .join(", ");

      if (!isExtern && !isMain && isClosureCall) {
        if (paramTypesStr.length > 0) {
          paramTypesStr = `i8*, ${paramTypesStr}`;
        } else {
          paramTypesStr = `i8*`;
        }
      }

      if (isExtern) {
        this.emit(
          `  ${reg} = call ${retType} (${paramTypesStr}, ...) ${callTarget}(${finalArgs})`,
        );
      } else {
        this.emit(
          `  ${reg} = call ${retType} (${paramTypesStr}) ${callTarget}(${finalArgs})`,
        );
      }
    } else {
      this.emit(`  ${reg} = call ${retType} ${callTarget}(${finalArgs})`);
    }
    return reg;
  }
}
