import * as fs from "fs";
import * as path from "path";

import type * as AST from "../common/AST";
import type { ModuleInfo } from "./ModuleResolver";

export function createModuleCacheContent(
  modules: ModuleInfo[],
  currentModule: ModuleInfo,
): string {
  const dependencyInterfaces = getModuleCacheInterfaceDependencies(
    modules,
    currentModule,
  ).map((dependency) =>
    [
      `interface=${dependency.path}`,
      createModuleInterfaceSignature(dependency),
    ].join("\n"),
  );

  return [
    `module=${currentModule.path}`,
    fs.readFileSync(currentModule.path, "utf-8"),
    ...dependencyInterfaces,
  ].join("\n--- bpl cache key ---\n");
}

function getModuleCacheInterfaceDependencies(
  modules: ModuleInfo[],
  currentModule: ModuleInfo,
): ModuleInfo[] {
  const modulesByPath = new Map(modules.map((module) => [module.path, module]));
  const dependencies = new Set<string>();

  const visit = (modulePath: string) => {
    if (modulePath === currentModule.path || dependencies.has(modulePath)) {
      return;
    }

    const module = modulesByPath.get(modulePath);
    if (!module) {
      return;
    }

    dependencies.add(modulePath);
    for (const dependencyPath of module.dependencies) {
      visit(dependencyPath);
    }
  };

  for (const dependencyPath of currentModule.dependencies) {
    visit(dependencyPath);
  }

  for (const module of modules) {
    if (path.basename(module.path) === "primitives.bpl") {
      visit(module.path);
    }
  }

  return [...dependencies]
    .map((modulePath) => modulesByPath.get(modulePath))
    .filter((module): module is ModuleInfo => Boolean(module))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function createModuleInterfaceSignature(module: ModuleInfo): string {
  const exportedNames = getExportedNames(module.ast);
  const abiTypeNames = getAbiRelevantTypeNames(module.ast, exportedNames);
  const declarations = module.ast.statements
    .map((statement) =>
      createDeclarationSignature(statement, exportedNames, abiTypeNames),
    )
    .filter((signature): signature is Record<string, unknown> =>
      Boolean(signature),
    );

  return JSON.stringify(declarations);
}

function getExportedNames(ast: AST.Program): Set<string> {
  const exportedNames = new Set<string>();

  for (const statement of ast.statements) {
    if (statement.kind !== "Export") {
      continue;
    }

    for (const item of (statement as AST.ExportStmt).items) {
      exportedNames.add(item.name);
    }
  }

  return exportedNames;
}

type NamedTypeDeclaration =
  | AST.StructDecl
  | AST.SpecDecl
  | AST.EnumDecl
  | AST.TypeAliasDecl;

function getAbiRelevantTypeNames(
  ast: AST.Program,
  exportedNames: Set<string>,
): Set<string> {
  const typeDeclarations = getTypeDeclarations(ast);
  const abiTypeNames = new Set<string>();
  const pending: NamedTypeDeclaration[] = [];

  const markTypeName = (name: string | undefined) => {
    if (!name || abiTypeNames.has(name)) {
      return;
    }

    const declaration = typeDeclarations.get(name);
    if (!declaration) {
      return;
    }

    abiTypeNames.add(name);
    pending.push(declaration);
  };

  const collectType = (type: AST.TypeNode | undefined) => {
    collectTypeReferences(type, markTypeName);
  };

  const collectFunction = (declaration: AST.FunctionDecl) => {
    collectGenericParamReferences(declaration.genericParams, collectType);
    for (const param of declaration.params) {
      collectType(param.type);
    }
    collectType(declaration.returnType);
  };

  for (const name of exportedNames) {
    markTypeName(name);
  }

  for (const statement of ast.statements) {
    switch (statement.kind) {
      case "FunctionDecl": {
        const declaration = statement as AST.FunctionDecl;
        if (exportedNames.has(declaration.name)) {
          collectFunction(declaration);
        }
        break;
      }
      case "VariableDecl": {
        const declaration = statement as AST.VariableDecl;
        if (
          typeof declaration.name === "string" &&
          exportedNames.has(declaration.name)
        ) {
          collectType(declaration.typeAnnotation);
          if (declaration.isConst) {
            collectExpressionTypeReferences(
              declaration.initializer,
              markTypeName,
            );
          }
        }
        break;
      }
      case "Extern": {
        const declaration = statement as AST.ExternDecl;
        if (exportedNames.has(declaration.name)) {
          for (const param of declaration.params) {
            collectType(param.type);
          }
          collectType(declaration.returnType);
        }
        break;
      }
    }
  }

  while (pending.length > 0) {
    collectTypeDeclarationReferences(pending.shift()!, markTypeName);
  }

  return abiTypeNames;
}

function getTypeDeclarations(
  ast: AST.Program,
): Map<string, NamedTypeDeclaration> {
  const declarations = new Map<string, NamedTypeDeclaration>();

  for (const statement of ast.statements) {
    switch (statement.kind) {
      case "StructDecl":
      case "SpecDecl":
      case "EnumDecl":
      case "TypeAlias": {
        const declaration = statement as NamedTypeDeclaration;
        declarations.set(declaration.name, declaration);
        break;
      }
    }
  }

  return declarations;
}

function collectTypeDeclarationReferences(
  declaration: NamedTypeDeclaration,
  markTypeName: (name: string | undefined) => void,
): void {
  const collectType = (type: AST.TypeNode | undefined) => {
    collectTypeReferences(type, markTypeName);
  };

  switch (declaration.kind) {
    case "StructDecl": {
      collectGenericParamReferences(declaration.genericParams, collectType);
      for (const inheritedType of declaration.inheritanceList) {
        collectType(inheritedType);
      }
      for (const member of declaration.members) {
        if (member.kind === "FunctionDecl") {
          collectFunctionTypeReferences(member as AST.FunctionDecl, collectType);
        } else {
          collectType(member.type);
        }
      }
      break;
    }
    case "SpecDecl": {
      collectGenericParamReferences(declaration.genericParams, collectType);
      for (const inheritedType of declaration.extends) {
        collectType(inheritedType);
      }
      for (const method of declaration.methods) {
        collectGenericParamReferences(method.genericParams, collectType);
        for (const param of method.params) {
          collectType(param.type);
        }
        collectType(method.returnType);
      }
      break;
    }
    case "EnumDecl": {
      collectGenericParamReferences(declaration.genericParams, collectType);
      for (const implementedType of declaration.implements) {
        collectType(implementedType);
      }
      for (const variant of declaration.variants) {
        collectEnumVariantDataTypeReferences(variant.dataType, collectType);
      }
      for (const method of declaration.methods) {
        collectFunctionTypeReferences(method, collectType);
      }
      break;
    }
    case "TypeAlias": {
      collectGenericParamReferences(declaration.genericParams, collectType);
      collectType(declaration.type);
      break;
    }
  }
}

function collectFunctionTypeReferences(
  declaration: AST.FunctionDecl,
  collectType: (type: AST.TypeNode | undefined) => void,
): void {
  collectGenericParamReferences(declaration.genericParams, collectType);
  for (const param of declaration.params) {
    collectType(param.type);
  }
  collectType(declaration.returnType);
}

function collectGenericParamReferences(
  genericParams: AST.GenericParam[],
  collectType: (type: AST.TypeNode | undefined) => void,
): void {
  for (const param of genericParams) {
    collectType(param.constraint);
  }
}

function collectEnumVariantDataTypeReferences(
  dataType: AST.EnumVariantData | undefined,
  collectType: (type: AST.TypeNode | undefined) => void,
): void {
  if (!dataType) {
    return;
  }

  switch (dataType.kind) {
    case "EnumVariantTuple":
      for (const type of dataType.types) {
        collectType(type);
      }
      break;
    case "EnumVariantStruct":
      for (const field of dataType.fields) {
        collectType(field.type);
      }
      break;
  }
}

function collectTypeReferences(
  type: AST.TypeNode | undefined,
  markTypeName: (name: string | undefined) => void,
): void {
  if (!type) {
    return;
  }

  switch (type.kind) {
    case "BasicType":
      markTypeName(type.name);
      for (const arg of type.genericArgs) {
        collectTypeReferences(arg, markTypeName);
      }
      break;
    case "TupleType":
      for (const item of type.types) {
        collectTypeReferences(item, markTypeName);
      }
      break;
    case "FunctionType":
    case "LambdaType":
      collectTypeReferences(type.returnType, markTypeName);
      for (const param of type.paramTypes) {
        collectTypeReferences(param, markTypeName);
      }
      break;
    case "MetaType":
      collectTypeReferences(type.type, markTypeName);
      break;
  }
}

function collectExpressionTypeReferences(
  expression: AST.Expression | undefined,
  markTypeName: (name: string | undefined) => void,
): void {
  collectAstTypeReferences(expression, markTypeName);
}

function collectAstTypeReferences(
  value: unknown,
  markTypeName: (name: string | undefined) => void,
  seen = new WeakSet<object>(),
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAstTypeReferences(item, markTypeName, seen);
    }
    return;
  }

  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);

  const objectValue = value as Record<string, unknown>;
  if (isTypeNodeObject(objectValue)) {
    collectTypeReferences(objectValue as AST.TypeNode, markTypeName);
    return;
  }

  switch (objectValue.kind) {
    case "Block":
      return;
    case "LambdaExpression":
      collectAstTypeReferences(objectValue.params, markTypeName, seen);
      collectAstTypeReferences(objectValue.returnType, markTypeName, seen);
      return;
    case "StructLiteral":
      markTypeName(objectValue.structName as string | undefined);
      break;
    case "EnumStructVariant":
    case "PatternEnum":
    case "PatternEnumTuple":
    case "PatternEnumStruct":
      markTypeName(objectValue.enumName as string | undefined);
      break;
  }

  for (const key of Object.keys(objectValue)) {
    if (AST_TYPE_REFERENCE_IGNORED_KEYS.has(key)) {
      continue;
    }

    collectAstTypeReferences(objectValue[key], markTypeName, seen);
  }
}

const AST_TYPE_REFERENCE_IGNORED_KEYS = new Set([
  "location",
  "documentation",
  "resolvedType",
  "resolvedDeclaration",
  "aliasDeclaration",
  "variableDeclaration",
  "declaration",
  "captures",
  "overloads",
  "operator",
  "operatorOverload",
  "enumVariantInfo",
  "desugared",
  "capturedVariables",
  "closureStructType",
  "captureStructName",
]);

function isTypeNodeObject(
  value: Record<string, unknown>,
): value is Record<string, unknown> & AST.TypeNode {
  return (
    value.kind === "BasicType" ||
    value.kind === "TupleType" ||
    value.kind === "FunctionType" ||
    value.kind === "LambdaType" ||
    value.kind === "MetaType"
  );
}

function createDeclarationSignature(
  statement: AST.Statement,
  exportedNames: Set<string>,
  abiTypeNames: Set<string>,
): Record<string, unknown> | undefined {
  switch (statement.kind) {
    case "Export": {
      const declaration = statement as AST.ExportStmt;
      return {
        kind: declaration.kind,
        items: declaration.items.map((item) => ({
          name: item.name,
          isType: item.isType,
          isWrapped: item.isWrapped ?? false,
        })),
      };
    }
    case "FunctionDecl": {
      const declaration = statement as AST.FunctionDecl;
      return exportedNames.has(declaration.name)
        ? createFunctionSignature(declaration)
        : undefined;
    }
    case "StructDecl": {
      const declaration = statement as AST.StructDecl;
      if (!abiTypeNames.has(declaration.name)) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        name: declaration.name,
        genericParams: createGenericParamSignatures(
          declaration.genericParams,
        ),
        inheritanceList: declaration.inheritanceList.map((type) =>
          createTypeSignature(type),
        ),
        members: declaration.members.map((member) =>
          member.kind === "FunctionDecl"
            ? createFunctionSignature(member as AST.FunctionDecl)
            : {
                kind: member.kind,
                name: member.name,
                type: createTypeSignature(member.type),
              },
        ),
      };
    }
    case "SpecDecl": {
      const declaration = statement as AST.SpecDecl;
      if (!abiTypeNames.has(declaration.name)) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        name: declaration.name,
        genericParams: createGenericParamSignatures(
          declaration.genericParams,
        ),
        extends: declaration.extends.map((type) => createTypeSignature(type)),
        methods: declaration.methods.map((method) => ({
          kind: method.kind,
          name: method.name,
          genericParams: createGenericParamSignatures(method.genericParams),
          params: method.params.map((param) => ({
            name: param.name,
            isConst: param.isConst ?? false,
            type: createTypeSignature(param.type),
          })),
          returnType: createTypeSignature(method.returnType),
        })),
      };
    }
    case "EnumDecl": {
      const declaration = statement as AST.EnumDecl;
      if (!abiTypeNames.has(declaration.name)) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        name: declaration.name,
        genericParams: createGenericParamSignatures(
          declaration.genericParams,
        ),
        implements: declaration.implements.map((type) =>
          createTypeSignature(type),
        ),
        variants: declaration.variants.map((variant) => ({
          kind: variant.kind,
          name: variant.name,
          dataType: createEnumVariantDataSignature(variant.dataType),
        })),
        methods: declaration.methods.map((method) =>
          createFunctionSignature(method),
        ),
      };
    }
    case "TypeAlias": {
      const declaration = statement as AST.TypeAliasDecl;
      if (!abiTypeNames.has(declaration.name)) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        name: declaration.name,
        genericParams: createGenericParamSignatures(
          declaration.genericParams,
        ),
        type: createTypeSignature(declaration.type),
      };
    }
    case "VariableDecl": {
      const declaration = statement as AST.VariableDecl;
      if (
        typeof declaration.name !== "string" ||
        !exportedNames.has(declaration.name)
      ) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        isGlobal: declaration.isGlobal,
        isConst: declaration.isConst,
        name: createStableAstSignature(declaration.name),
        typeAnnotation: createTypeSignature(declaration.typeAnnotation),
        initializer:
          declaration.isConst && declaration.initializer
            ? createStableAstSignature(declaration.initializer)
            : undefined,
      };
    }
    case "Extern": {
      const declaration = statement as AST.ExternDecl;
      if (!exportedNames.has(declaration.name)) {
        return undefined;
      }

      return {
        kind: declaration.kind,
        name: declaration.name,
        params: declaration.params.map((param) => ({
          name: param.name,
          type: createTypeSignature(param.type),
        })),
        isVariadic: declaration.isVariadic,
        returnType: createTypeSignature(declaration.returnType),
      };
    }
    default:
      return undefined;
  }
}

function createFunctionSignature(
  declaration: AST.FunctionDecl,
): Record<string, unknown> {
  return {
    kind: declaration.kind,
    isFrame: declaration.isFrame,
    isStatic: declaration.isStatic,
    name: declaration.name,
    attributes: declaration.attributes.map((attribute) => attribute.name),
    genericParams: createGenericParamSignatures(declaration.genericParams),
    params: declaration.params.map((param) => ({
      name: param.name,
      isConst: param.isConst ?? false,
      isVariadic: param.isVariadic ?? false,
      type: createTypeSignature(param.type),
    })),
    returnType: createTypeSignature(declaration.returnType),
  };
}

function createGenericParamSignatures(
  genericParams: AST.GenericParam[],
): Array<Record<string, unknown>> {
  return genericParams.map((param) => ({
    name: param.name,
    constraint: createTypeSignature(param.constraint),
  }));
}

function createEnumVariantDataSignature(
  dataType: AST.EnumVariantData | undefined,
): Record<string, unknown> | undefined {
  if (!dataType) {
    return undefined;
  }

  switch (dataType.kind) {
    case "EnumVariantUnit":
      return { kind: dataType.kind };
    case "EnumVariantTuple":
      return {
        kind: dataType.kind,
        types: dataType.types.map((type) => createTypeSignature(type)),
      };
    case "EnumVariantStruct":
      return {
        kind: dataType.kind,
        fields: dataType.fields.map((field) => ({
          name: field.name,
          type: createTypeSignature(field.type),
        })),
      };
  }
}

function createTypeSignature(
  type: AST.TypeNode | undefined,
): Record<string, unknown> | undefined {
  if (!type) {
    return undefined;
  }

  switch (type.kind) {
    case "BasicType":
      return {
        kind: type.kind,
        name: type.name,
        genericArgs: type.genericArgs.map((arg) => createTypeSignature(arg)),
        pointerDepth: type.pointerDepth,
        arrayDimensions: type.arrayDimensions,
        isConst: type.isConst ?? false,
        isPointerToArray: type.isPointerToArray ?? false,
      };
    case "TupleType":
      return {
        kind: type.kind,
        types: type.types.map((item) => createTypeSignature(item)),
        isConst: type.isConst ?? false,
        arrayDimensions: type.arrayDimensions ?? [],
      };
    case "FunctionType":
      return {
        kind: type.kind,
        returnType: createTypeSignature(type.returnType),
        paramTypes: type.paramTypes.map((param) =>
          createTypeSignature(param),
        ),
        isVariadic: type.isVariadic ?? false,
        isConst: type.isConst ?? false,
        arrayDimensions: type.arrayDimensions ?? [],
      };
    case "LambdaType":
      return {
        kind: type.kind,
        returnType: createTypeSignature(type.returnType),
        paramTypes: type.paramTypes.map((param) =>
          createTypeSignature(param),
        ),
        isVariadic: type.isVariadic ?? false,
        isConst: type.isConst ?? false,
        arrayDimensions: type.arrayDimensions ?? [],
      };
    case "MetaType":
      return {
        kind: type.kind,
        type: createTypeSignature(type.type),
      };
  }
}

function createStableAstSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => createStableAstSignature(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  const ignoredKeys = new Set([
    "location",
    "documentation",
    "resolvedDeclaration",
    "aliasDeclaration",
    "variableDeclaration",
    "declaration",
    "captures",
  ]);
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(objectValue).sort()) {
    if (ignoredKeys.has(key)) {
      continue;
    }

    if (key === "resolvedType") {
      result[key] = createTypeSignature(
        objectValue[key] as AST.TypeNode | undefined,
      );
      continue;
    }

    result[key] = createStableAstSignature(objectValue[key]);
  }

  return result;
}
