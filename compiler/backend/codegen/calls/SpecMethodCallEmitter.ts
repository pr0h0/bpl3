import * as AST from "../../../common/AST";
import { CompilerError } from "../../../common/CompilerError";
import { codeGenLog } from "../../../common/Logger";

export interface SpecMethodCallHost {
  generateExpression(expr: AST.Expression): string;
  resolveType(type: AST.TypeNode): string;
  newRegister(): string;
  emit(line: string): void;
  getAllSpecMethods(specDecl: AST.SpecDecl): AST.SpecMethod[];
  substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode;
  emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string;
}

export function emitSpecMethodCall(
  host: SpecMethodCallHost,
  callExpr: AST.CallExpr,
  memberExpr: AST.MemberExpr,
  specDecl: AST.SpecDecl,
): string {
  let objVal = host.generateExpression(memberExpr.object);
  const objType = memberExpr.object.resolvedType as AST.BasicTypeNode;

  if (objType.pointerDepth > 0) {
    const loaded = host.newRegister();
    const ptrType = host.resolveType(objType);
    const valType = ptrType.substring(0, ptrType.length - 1);
    host.emit(`  ${loaded} = load ${valType}, ${ptrType} ${objVal}`);
    objVal = loaded;
  }

  const objPtr = host.newRegister();
  host.emit(`  ${objPtr} = extractvalue { i8*, i8* } ${objVal}, 0`);

  const vtablePtr = host.newRegister();
  host.emit(`  ${vtablePtr} = extractvalue { i8*, i8* } ${objVal}, 1`);

  const allMethods = host.getAllSpecMethods(specDecl);
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

  const vtableArrayPtr = host.newRegister();
  host.emit(`  ${vtableArrayPtr} = bitcast i8* ${vtablePtr} to i8**`);

  const methodPtrPtr = host.newRegister();
  host.emit(
    `  ${methodPtrPtr} = getelementptr i8*, i8** ${vtableArrayPtr}, i32 ${methodIndex}`,
  );

  const methodVoidPtr = host.newRegister();
  host.emit(`  ${methodVoidPtr} = load i8*, i8** ${methodPtrPtr}`);

  const { retType, paramTypes, funcPtr } = resolveSpecMethodSignature(
    host,
    specDecl,
    memberExpr,
    allMethods[methodIndex]!,
    methodVoidPtr,
  );

  const argRegs: string[] = [];
  for (let i = 0; i < callExpr.args.length; i++) {
    const arg = callExpr.args[i]!;
    const val = host.generateExpression(arg);
    // Attempt cast if type mismatch.
    if (i < paramTypes.length) {
      const srcType = host.resolveType(arg.resolvedType!);
      const destType = paramTypes[i]!; // paramTypes excludes this (implied objPtr)

      if (srcType !== destType) {
        const castVal = host.emitCast(
          val,
          srcType,
          destType,
          arg.resolvedType!,
          {
            kind: "BasicType",
            name: "dummy",
          } as any,
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

  const resultReg = host.newRegister();
  if (retType === "void") {
    host.emit(`  call void ${funcPtr}(${callArgs.join(", ")})`);
    return "0";
  }
  host.emit(`  ${resultReg} = call ${retType} ${funcPtr}(${callArgs.join(", ")})`);
  return resultReg;
}

function resolveSpecMethodSignature(
  host: SpecMethodCallHost,
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
      pType = host.substituteType(pType, typeMap);
    }
    paramTypes.push(host.resolveType(pType));
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
    retTypeNode = host.substituteType(retTypeNode, typeMap);
  }
  const retType = host.resolveType(retTypeNode);

  const paramsStr = paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
  const funcSig = `${retType} (i8*${paramsStr})`;
  const funcPtr = host.newRegister();
  host.emit(`  ${funcPtr} = bitcast i8* ${methodVoidPtr} to ${funcSig}*`);

  return { retType, paramTypes, funcPtr };
}
