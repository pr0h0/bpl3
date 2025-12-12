import type { VariableType } from "../parser/expression/variableDeclarationExpr";
import type FunctionDeclarationExpr from "../parser/expression/functionDeclaration";
import type Expression from "../parser/expression/expr";
import Token from "../lexer/token";
import { CompilerError } from "../errors";
import { TypeRegistry, type TypeInfo, type InfoType } from "./TypeRegistry";
import { SymbolTable, type VarInfo, type FunctionInfo } from "./SymbolTable";

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

// Re-export types for compatibility
export type { TypeInfo, InfoType, VarInfo, FunctionInfo };

export default class Scope {
  private static nextId = 0;
  static idCounter = 0;
  public id: number;

  public typeRegistry: TypeRegistry;
  public symbolTable: SymbolTable;

  public stackOffset = 0; // Tracks stack usage for this function
  public localsOffset = 0; // Tracks size of locals allocated (used for alignment calculation)
  public currentContext: ContextType[] = [];

  /**
   * Stack of deferred expressions for the current function scope.
   * Deferred expressions are executed in LIFO order when the function exits.
   * This is similar to Go's defer statement.
   */
  private deferredExpressions: Expression[] = [];

  constructor(public parent: Scope | null = null) {
    this.id = Scope.idCounter++;
    this.parent = parent;
    this.typeRegistry = new TypeRegistry(parent?.typeRegistry);
    this.symbolTable = new SymbolTable(parent?.symbolTable);
  }

  // Getters for backward compatibility
  get types() {
    return this.typeRegistry.getTypes();
  }
  get vars() {
    return this.symbolTable.getVariables();
  }
  get functions() {
    return this.symbolTable.getFunctions();
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

  // #region Defer Management
  /**
   * Adds an expression to the defer stack.
   * The expression will be executed when the function exits.
   * Deferred expressions are stored in FIFO order but executed in LIFO order.
   *
   * @param expr - The expression to defer
   */
  addDeferredExpression(expr: Expression): void {
    this.deferredExpressions.push(expr);
  }

  /**
   * Gets all deferred expressions in execution order (LIFO - reverse of registration order).
   * This returns a new array with the expressions in the order they should be executed.
   *
   * @returns Array of deferred expressions in LIFO order
   */
  getDeferredExpressions(): Expression[] {
    // Return a reversed copy (LIFO order - last registered executes first)
    return [...this.deferredExpressions].reverse();
  }

  /**
   * Checks if there are any deferred expressions in this scope.
   *
   * @returns true if there are deferred expressions
   */
  hasDeferredExpressions(): boolean {
    return this.deferredExpressions.length > 0;
  }

  /**
   * Clears all deferred expressions (called after they've been emitted).
   */
  clearDeferredExpressions(): void {
    this.deferredExpressions = [];
  }
  // #endregion

  // #region Variables
  resolve(name: string): VarInfo | null {
    const variable = this.symbolTable.getVariable(name);
    if (variable) {
      variable.usageCount = (variable.usageCount || 0) + 1;
      return variable;
    }
    return null;
  }

  // Define a new variable
  define(name: string, info: VarInfo) {
    this.symbolTable.addVariable(name, { ...info, usageCount: 0 });
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
      return;
    }

    const existing = this.symbolTable.getFunction(name);
    if (existing) {
      if (existing.isExternal && info.isExternal) {
        if (existing.args.length < info.args.length) {
          this.symbolTable.addFunction(name, {
            ...info,
            definitionScope: this,
          });
        }
        return; // Allow re-definition of external functions
      }
      throw new CompilerError(
        `Function ${name} is already defined.`,
        info.declaration?.line || 0,
      );
    } else {
      this.symbolTable.addFunction(name, { ...info, definitionScope: this });
    }
  }

  resolveFunction(name: string): FunctionInfo | null {
    const func = this.symbolTable.getFunction(name);
    return func || null;
  }

  resolveMethod(structName: string, methodName: string): FunctionInfo | null {
    const { mangleMethod } = require("../utils/methodMangler");
    const mangledName = mangleMethod(structName, methodName);
    return this.resolveFunction(mangledName);
  }
  // #endregion

  // #region Types
  defineType(name: string, info: TypeInfo) {
    if (this.typeRegistry.getTypes().has(name)) {
      throw new CompilerError(
        `Type ${name} is already defined.`,
        info.declaration?.line || 0,
      );
    }

    if (info.size === 0) {
      const size = this.calculateSizeOfType(info);
      info.size = size;
    }
    this.typeRegistry.addType(name, info);
  }

  resolveType(name: string): TypeInfo | null {
    return this.typeRegistry.getType(name) || null;
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
    token?: Token,
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
        throw new CompilerError(
          `Type '${name}' is not generic.`,
          token?.line || 0,
        );
      }
      return baseType;
    }

    if (args.length !== baseType.genericParams.length) {
      throw new CompilerError(
        `Type '${name}' expects ${baseType.genericParams.length} generic arguments, but got ${args.length}.`,
        token?.line || 0,
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
      throw new CompilerError(
        "Generic type missing field definitions.",
        token?.line || 0,
      );
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
        throw new CompilerError(
          `Could not resolve type '${concreteType.name}' during instantiation of '${instantiationName}'.`,
          token?.line || 0,
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
