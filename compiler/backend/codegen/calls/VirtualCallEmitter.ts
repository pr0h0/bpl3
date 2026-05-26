import * as AST from "../../../common/AST";
import { CompilerError } from "../../../common/CompilerError";
import { PRIMITIVE_STRUCT_MAP } from "../../../middleend/BuiltinTypes";

export interface VirtualCallHost {
  labelCount: number;
  vtableLayouts: Map<string, string[]>;
  structMap: Map<string, AST.StructDecl>;
  generateExpression(expr: AST.Expression): string;
  resolveType(type: AST.TypeNode): string;
  generateAddress(expr: AST.Expression): string;
  allocateStack(name: string, type: string): string;
  emit(line: string): void;
  newRegister(): string;
  substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode;
  getMangledName(
    name: string,
    type: AST.FunctionTypeNode,
    isExtern?: boolean,
    genericArgs?: AST.TypeNode[],
  ): string;
  emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string;
}

export function emitVirtualCall(
  host: VirtualCallHost,
  callExpr: AST.CallExpr,
  memberExpr: AST.MemberExpr,
  structName: string,
  methodIndex: number,
  argsToGenerate: AST.Expression[],
): string {
  const objRaw = host.generateExpression(memberExpr.object);
  const objType = host.resolveType(memberExpr.object.resolvedType!);

  const { objPtr, structType } = prepareVirtualCallObject(
    host,
    memberExpr,
    objRaw,
    objType,
    structName,
  );

  const methodVoidPtr = loadVTableMethod(
    host,
    objPtr,
    structType,
    methodIndex,
  );

  const {
    funcType: _funcType,
    retType,
    paramTypes,
  } = resolveVirtualMethodSignature(host, callExpr, memberExpr, structName);

  const funcSig = `${retType} (${paramTypes.join(", ")})`;
  const funcPtr = host.newRegister();
  host.emit(`  ${funcPtr} = bitcast i8* ${methodVoidPtr} to ${funcSig}*`);

  const callArgs = prepareVirtualCallArgs(
    host,
    objPtr,
    structType,
    paramTypes,
    argsToGenerate,
    _funcType.paramTypes,
  );

  const resultReg = host.newRegister();
  if (retType === "void") {
    host.emit(`  call void ${funcPtr}(${callArgs.join(", ")})`);
    return "0";
  }
  host.emit(
    `  ${resultReg} = call ${retType} ${funcPtr}(${callArgs.join(", ")})`,
  );
  return resultReg;
}

function prepareVirtualCallObject(
  host: VirtualCallHost,
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
    return boxPrimitiveForVirtualCall(host, objRaw, objType, structName);
  }

  if (!objType.endsWith("*")) {
    try {
      if (!isAddressableVirtualReceiver(memberExpr.object)) {
        throw new Error("receiver is not addressable");
      }
      objPtr = host.generateAddress(memberExpr.object);
      structType = objType + "*";
    } catch {
      const spillAddr = host.allocateStack(
        `vcall_spill_${host.labelCount++}`,
        objType,
      );
      host.emit(`  store ${objType} ${objRaw}, ${objType}* ${spillAddr}`);
      objPtr = spillAddr;
      structType = objType + "*";
    }
  }

  return { objPtr, structType };
}

function isAddressableVirtualReceiver(expr: AST.Expression): boolean {
  if (
    expr.kind === "Identifier" ||
    expr.kind === "Member" ||
    expr.kind === "Index"
  ) {
    return true;
  }

  if (expr.kind === "Group") {
    return isAddressableVirtualReceiver((expr as AST.GroupExpr).expression);
  }

  if (expr.kind === "Unary") {
    return (expr as AST.UnaryExpr).operator.type === "Star";
  }

  return false;
}

function boxPrimitiveForVirtualCall(
  host: VirtualCallHost,
  objRaw: string,
  objType: string,
  structName: string,
): { objPtr: string; structType: string } {
  const wrapperType = `%struct.${structName}`;
  const wrapperPtr = host.allocateStack(
    `boxed_${structName}_${host.labelCount++}`,
    wrapperType,
  );

  const vtablePtrPtr = host.newRegister();
  host.emit(
    `  ${vtablePtrPtr} = getelementptr ${wrapperType}, ${wrapperType}* ${wrapperPtr}, i32 0, i32 0`,
  );
  const vtableGlobal = `@${structName}_vtable`;
  const vtableType = `[${host.vtableLayouts.get(structName)!.length} x i8*]`;
  const vtableCast = host.newRegister();
  host.emit(`  ${vtableCast} = bitcast ${vtableType}* ${vtableGlobal} to i8*`);
  host.emit(`  store i8* ${vtableCast}, i8** ${vtablePtrPtr}`);

  const valuePtr = host.newRegister();
  host.emit(
    `  ${valuePtr} = getelementptr ${wrapperType}, ${wrapperType}* ${wrapperPtr}, i32 0, i32 1`,
  );
  host.emit(`  store ${objType} ${objRaw}, ${objType}* ${valuePtr}`);

  return { objPtr: wrapperPtr, structType: wrapperType + "*" };
}

function loadVTableMethod(
  host: VirtualCallHost,
  objPtr: string,
  structType: string,
  methodIndex: number,
): string {
  const vtablePtrPtr = host.newRegister();
  host.emit(
    `  ${vtablePtrPtr} = getelementptr ${structType.slice(
      0,
      -1,
    )}, ${structType} ${objPtr}, i32 0, i32 0`,
  );

  const vtablePtr = host.newRegister();
  host.emit(`  ${vtablePtr} = load i8*, i8** ${vtablePtrPtr}`);

  const vtableArrayPtr = host.newRegister();
  host.emit(`  ${vtableArrayPtr} = bitcast i8* ${vtablePtr} to i8**`);

  const methodPtrPtr = host.newRegister();
  host.emit(
    `  ${methodPtrPtr} = getelementptr i8*, i8** ${vtableArrayPtr}, i32 ${methodIndex}`,
  );

  const methodVoidPtr = host.newRegister();
  host.emit(`  ${methodVoidPtr} = load i8*, i8** ${methodPtrPtr}`);

  return methodVoidPtr;
}

function resolveVirtualMethodSignature(
  host: VirtualCallHost,
  callExpr: AST.CallExpr,
  memberExpr: AST.MemberExpr,
  structName: string,
): { funcType: AST.FunctionTypeNode; retType: string; paramTypes: string[] } {
  let structDecl = host.structMap.get(structName);
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

  const { methodDecl, genericMap } = findVirtualMethod(
    host,
    callExpr,
    memberExpr,
    structDecl,
  );

  let funcType = methodDecl.resolvedType as AST.FunctionTypeNode;
  if (genericMap.size > 0) {
    funcType = {
      ...funcType,
      returnType: host.substituteType(funcType.returnType, genericMap),
      paramTypes: funcType.paramTypes.map((p) =>
        host.substituteType(p, genericMap),
      ),
    };
  }

  const retType = host.resolveType(funcType.returnType);
  const paramTypes = funcType.paramTypes.map((t) => host.resolveType(t));

  return { funcType, retType, paramTypes };
}

function findVirtualMethod(
  host: VirtualCallHost,
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
    const found = findMethodInDecl(
      host,
      currentDecl,
      memberExpr.property,
      targetDecl,
    );

    if (found) {
      methodDecl = found;
      break;
    }

    const parentResult = getParentDecl(host, currentDecl, genericMap);
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

function findMethodInDecl(
  host: VirtualCallHost,
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
        const m1 = host.getMangledName(
          fd.name,
          fd.resolvedType as AST.FunctionTypeNode,
        );
        const m2 = host.getMangledName(
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

function getParentDecl(
  host: VirtualCallHost,
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
              arg = host.substituteType(arg, genericMap);
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

function prepareVirtualCallArgs(
  host: VirtualCallHost,
  objPtr: string,
  structType: string,
  paramTypes: string[],
  argsToGenerate: AST.Expression[],
  paramTypeNodes: AST.TypeNode[],
): string[] {
  const callArgs: string[] = [];
  const thisType = paramTypes[0]!;

  if (thisType.endsWith("*")) {
    const thisArg = host.newRegister();
    host.emit(`  ${thisArg} = bitcast ${structType} ${objPtr} to ${thisType}`);
    callArgs.push(`${thisType} ${thisArg}`);
  } else {
    const ptrType = thisType + "*";
    const ptrReg = host.newRegister();
    host.emit(`  ${ptrReg} = bitcast ${structType} ${objPtr} to ${ptrType}`);

    const valReg = host.newRegister();
    host.emit(`  ${valReg} = load ${thisType}, ${ptrType} ${ptrReg}`);

    callArgs.push(`${thisType} ${valReg}`);
  }

  for (let i = 0; i < argsToGenerate.length; i++) {
    const arg = argsToGenerate[i]!;
    const val = host.generateExpression(arg);
    const destTypeStr = paramTypes[i + 1]!;
    const destTypeNode = paramTypeNodes[i + 1]!;

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

    const srcTypeStr = host.resolveType(resolvedArgType);
    const castVal = host.emitCast(
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
