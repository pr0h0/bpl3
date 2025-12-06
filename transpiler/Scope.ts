import type { VariableType } from "../parser/expression/variableDeclarationExpr";
import type FunctionDeclarationExpr from "../parser/expression/functionDeclaration";
import Token from "../lexer/token";

export interface VarInfo {
  type: "local" | "global";
  offset: string;
  varType: VariableType;
  isParameter?: boolean;
  declaration?: Token;
  sourceFile?: string;
  usageCount?: number; // Track number of times variable is used
  llvmName?: string;
  irName?: string;
}

export type ContextType =
  | {
      type: "function";
      label: string;
      endLabel: string;
      returnType: VariableType | null;
    }
  | {
      type: "loop";
      breakLabel: string;
      continueLabel: string;
      stackOffset: number;
    }
  | { type: "LHS" }
  | null;

export type TypeInfo = {
  name: string;
  isPointer: number;
  isArray: number[];
  size: number;
  offset?: number;
  alignment?: number;
  isPrimitive: boolean;
  members: Map<string, TypeInfo>;
  info: InfoType;
  declaration?: Token;
  sourceFile?: string;
  genericParams?: string[];
  genericFields?: { name: string; type: VariableType }[];
  genericMethods?: any[]; // Store method AST nodes for generic structs
  definingScope?: Scope; // The scope where this type was originally defined (for generic instantiation)
  index?: number;
  parentType?: string;
};

export type InfoType = {
  description: string;
  signed?: boolean;
  [key: string]: any;
};

export type FunctionInfo = {
  name: string;
  label: string;
  startLabel: string;
  endLabel: string;
  args: { type: VariableType; name: string }[];
  returnType: VariableType | null;
  isExternal?: boolean;
  isVariadic?: boolean;
  variadicType?: VariableType | null;
  declaration?: Token;
  sourceFile?: string;
  llvmName?: string;
  irName?: string;
  isMethod?: boolean;
  receiverStruct?: string;
  originalName?: string;
  genericParams?: string[];
  astDeclaration?: FunctionDeclarationExpr; // Store AST for monomorphization
  definitionScope?: Scope;
};

export default class Scope {
  private static nextId = 0;
  static idCounter = 0;
  public id: number;
  public types = new Map<string, TypeInfo>();
  public vars = new Map<string, VarInfo>();
  public stackOffset = 0; // Tracks stack usage for this function
  public localsOffset = 0; // Tracks size of locals allocated (used for alignment calculation)
  public functions = new Map<string, FunctionInfo>();
  public currentContext: ContextType[] = [];

  constructor(public parent: Scope | null = null) {
    this.id = Scope.idCounter++;
    this.parent = parent;
    this.vars = new Map();
  }

  // #region Context Management
  removeCurrentContext(type: "loop" | "function" | "LHS") {
    const index = this.currentContext.findLastIndex(
      (ctx) => ctx?.type === type,
    );
    if (index !== -1) {
      this.currentContext.splice(index, 1);
    }
  }

  setCurrentContext(context: Exclude<ContextType, null>) {
    this.currentContext.push(context);
  }

  getCurrentContext(type: "loop" | "function" | "LHS"): ContextType {
    const current = this.currentContext.findLast((ctx) => ctx?.type === type);
    if (current) {
      return current;
    } else if (this.parent) {
      return this.parent.getCurrentContext(type);
    } else {
      return null;
    }
  }
  // #endregion

  // #region Variables
  resolve(name: string): VarInfo | null {
    const variable = this.vars.get(name);
    if (variable) {
      variable.usageCount = (variable.usageCount || 0) + 1;
      return variable;
    }
    return this.parent?.resolve(name) || null;
  }

  // Define a new variable
  define(name: string, info: VarInfo) {
    this.vars.set(name, { ...info, usageCount: 0 });
  }

  // Allocate space on stack (e.g., 8 bytes for 64-bit int)
  allocLocal(size: number = 8): number {
    this.stackOffset += size;
    this.localsOffset += size;
    return this.stackOffset;
  }

  // #endregion

  // #region functions
  defineFunction(name: string, info: FunctionInfo) {
    if (this.parent) {
      this.parent.defineFunction(name, info);
    } else if (this.functions.has(name)) {
      if (this.functions.get(name)!.isExternal && info.isExternal) {
        if (this.functions.get(name)!.args.length < info.args.length) {
          this.functions.set(name, { ...info, definitionScope: this });
        }
        return; // Allow re-definition of external functions
      }
      throw new Error(`Function ${name} is already defined.`);
    } else {
      this.functions.set(name, { ...info, definitionScope: this });
    }
  }

  resolveFunction(name: string): FunctionInfo | null {
    if (this.functions.has(name)) {
      return this.functions.get(name)!;
    }
    if (this.parent) {
      return this.parent.resolveFunction(name);
    }
    return null;
  }

  resolveMethod(structName: string, methodName: string): FunctionInfo | null {
    const { mangleMethod } = require("../utils/methodMangler");
    const mangledName = mangleMethod(structName, methodName);
    return this.resolveFunction(mangledName);
  }
  // #endregion

  // #region Types
  defineType(name: string, info: TypeInfo) {
    if (this.types.has(name)) {
      throw new Error(`Type ${name} is already defined.`);
    }
    if (info.size === 0) {
      const size = this.calculateSizeOfType(info);
      info.size = size;
    }
    this.types.set(name, info);
  }
  resolveType(name: string): TypeInfo | null {
    return this.types.get(name) || this.parent?.resolveType(name) || null;
  }
  calculateSizeOfType(type: TypeInfo): number {
    if (type.isPrimitive) {
      return type.size;
    }

    if (type.isPointer > 0) {
      return 8; // Assuming 64-bit pointers
    }

    if (type.isArray.length > 0) {
      let baseSize = this.calculateSizeOfType({
        ...type,
        isArray: [],
      });
      for (let dim of type.isArray) {
        baseSize *= dim;
      }
      return baseSize;
    }

    let totalSize = 0;
    for (let member of type.members.values()) {
      totalSize += member.size;
    }
    return totalSize;
  }

  resolveGenericType(
    name: string,
    args: VariableType[],
    contextScope?: Scope,
  ): TypeInfo | null {
    const instantiationName = `${name}<${args.map((a) => this.getCanonicalTypeName(a)).join(",")}>`;

    const existing = this.resolveType(instantiationName);
    if (existing) {
      return existing;
    }

    const baseType = this.resolveType(name);
    if (!baseType) {
      return null;
    }

    if (!baseType.genericParams || baseType.genericParams.length === 0) {
      if (args.length > 0) {
        throw new Error(`Type '${name}' is not generic.`);
      }
      return baseType;
    }

    if (args.length !== baseType.genericParams.length) {
      throw new Error(
        `Type '${name}' expects ${baseType.genericParams.length} generic arguments, but got ${args.length}.`,
      );
    }

    const newType: TypeInfo = {
      name: instantiationName,
      isPointer: 0,
      isArray: [],
      size: 0,
      alignment: 1,
      isPrimitive: false,
      members: new Map(),
      info: { description: `Instantiated ${name}` },
      declaration: baseType.declaration,
      sourceFile: baseType.sourceFile,
      genericMethods: baseType.genericMethods,
      genericParams: baseType.genericParams, // Keep generic params for reference
      definingScope: baseType.definingScope, // Preserve the defining scope for method instantiation
    };

    // Register the type early to handle recursive references (e.g. pointers to self)
    this.getGlobalScope().defineType(instantiationName, newType);

    const paramMap = new Map<string, VariableType>();
    baseType.genericParams.forEach((param, index) => {
      paramMap.set(param, args[index]!);
    });

    let currentOffset = 0;
    let maxAlignment = 1;
    let fieldIndex = 0;

    // Handle inheritance for generic instantiation
    if (baseType.parentType) {
      const parentType = this.resolveType(baseType.parentType);
      if (parentType) {
        for (const [name, info] of parentType.members) {
          newType.members.set(name, info);
          if (info.index !== undefined) {
            fieldIndex = Math.max(fieldIndex, info.index + 1);
          }
        }
        currentOffset = parentType.size;
        maxAlignment = parentType.alignment || 1;
        newType.parentType = baseType.parentType;
      }
    }

    if (!baseType.genericFields) {
      throw new Error("Generic type missing field definitions.");
    }

    baseType.genericFields.forEach((field) => {
      const concreteType = this.substituteType(field.type, paramMap);

      let fieldTypeInfo: TypeInfo | null = null;
      if (concreteType.genericArgs && concreteType.genericArgs.length > 0) {
        fieldTypeInfo = this.resolveGenericType(
          concreteType.name,
          concreteType.genericArgs,
          contextScope,
        );

        if (!fieldTypeInfo && baseType.definingScope) {
          fieldTypeInfo = baseType.definingScope.resolveGenericType(
            concreteType.name,
            concreteType.genericArgs,
            this,
          );
        }

        if (!fieldTypeInfo && contextScope) {
          fieldTypeInfo = contextScope.resolveGenericType(
            concreteType.name,
            concreteType.genericArgs,
            contextScope,
          );
        }
      } else {
        fieldTypeInfo = this.resolveType(concreteType.name);

        if (!fieldTypeInfo && baseType.definingScope) {
          fieldTypeInfo = baseType.definingScope.resolveType(concreteType.name);
        }

        if (!fieldTypeInfo && contextScope) {
          fieldTypeInfo = contextScope.resolveType(concreteType.name);
        }
      }

      if (!fieldTypeInfo) {
        throw new Error(
          `Could not resolve type '${concreteType.name}' during instantiation of '${instantiationName}'.`,
        );
      }

      // Ensure the resolved field type is available in the current scope
      // This is crucial when the field type was resolved from a defining scope (e.g. Array in Map)
      // but needs to be visible in the instantiation scope (e.g. test_map.x)
      if (!this.resolveType(fieldTypeInfo.name)) {
        this.defineType(fieldTypeInfo.name, fieldTypeInfo);
      }

      const size = fieldTypeInfo.size;

      let fieldSize = fieldTypeInfo.size;
      let fieldAlignment = fieldTypeInfo.alignment || 1;

      if (concreteType.isPointer > 0) {
        fieldSize = 8;
        fieldAlignment = 8;
      } else if (concreteType.isArray.length > 0) {
        fieldSize =
          fieldTypeInfo.size * concreteType.isArray.reduce((a, b) => a * b, 1);
        fieldAlignment = fieldTypeInfo.alignment || 1;
      }

      const padding =
        (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
      currentOffset += padding;

      newType.members.set(field.name, {
        info: { description: `Field ${field.name}` },
        name: fieldTypeInfo.name, // This is the instantiated name like "Inner<u64>" if generic
        isArray: concreteType.isArray,
        isPointer: concreteType.isPointer,
        size: fieldSize,
        offset: currentOffset,
        alignment: fieldAlignment,
        isPrimitive: fieldTypeInfo.isPrimitive,
        members: fieldTypeInfo.members,
        index: fieldIndex,
      });
      fieldIndex++;

      currentOffset += fieldSize;
      maxAlignment = Math.max(maxAlignment, fieldAlignment);
    });

    const structPadding =
      (maxAlignment - (currentOffset % maxAlignment)) % maxAlignment;
    newType.size = currentOffset + structPadding;
    newType.alignment = maxAlignment;

    // Register methods for the instantiated generic type
    // REMOVED: We now handle method instantiation in SemanticAnalyzer on demand
    // to ensure proper code generation and type substitution in the body.

    return newType;
  }

  private getCanonicalTypeName(type: VariableType): string {
    let name = type.name;
    if (type.genericArgs && type.genericArgs.length > 0) {
      name += `<${type.genericArgs.map((a) => this.getCanonicalTypeName(a)).join(",")}>`;
    }
    if (type.isPointer) name += "*".repeat(type.isPointer);
    if (type.isArray.length) name += "[]".repeat(type.isArray.length);
    return name;
  }

  private substituteType(
    type: VariableType,
    paramMap: Map<string, VariableType>,
  ): VariableType {
    if (paramMap.has(type.name)) {
      const replacement = paramMap.get(type.name)!;
      return {
        ...replacement,
        isPointer: replacement.isPointer + type.isPointer,
        isArray: [...replacement.isArray, ...type.isArray],
      };
    }

    if (type.genericArgs && type.genericArgs.length > 0) {
      return {
        ...type,
        genericArgs: type.genericArgs.map((arg) =>
          this.substituteType(arg, paramMap),
        ),
      };
    }

    return type;
  }
  // #endregion

  getGlobalScope(): Scope {
    return this.parent ? this.parent.getGlobalScope() : this;
  }
}
