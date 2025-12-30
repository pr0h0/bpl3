/**
 * TypeCheckerBase - Base class with shared state and utility methods for type checking
 * This class provides the foundation for modular type checking with separate
 * expression and statement checkers.
 */

import * as AST from "../common/AST";
import { CompilerError } from "../common/CompilerError";
import { TokenType } from "../frontend/TokenType";
import { LinkerSymbolTable } from "./LinkerSymbolTable";
import type { Symbol, SymbolKind } from "./SymbolTable";
import { SymbolTable } from "./SymbolTable";
import {
  initializeBuiltinsInScope,
  PRIMITIVE_STRUCT_MAP,
} from "./BuiltinTypes";
import { TypeUtils, TypeSubstitution, NUMERIC_TYPES } from "./TypeUtils";

/**
 * Base class for TypeChecker with shared state and utility methods
 */
export abstract class TypeCheckerBase {
  // ========== State ==========
  public globalScope: SymbolTable;
  public currentScope: SymbolTable;
  public currentFunctionReturnType: AST.TypeNode | undefined;
  public modules: Map<string, SymbolTable> = new Map();
  public skipImportResolution: boolean;
  public preLoadedModules: Map<string, AST.Program> = new Map();
  public linkerSymbolTable: LinkerSymbolTable;
  public currentModulePath: string = "unknown";
  public errors: CompilerError[] = [];
  public collectAllErrors: boolean = true;
  public loopDepth: number = 0;
  public inDefer: boolean = false;

  constructor(
    options: {
      skipImportResolution?: boolean;
      collectAllErrors?: boolean;
    } = {},
  ) {
    this.globalScope = new SymbolTable();
    this.currentScope = this.globalScope;
    this.skipImportResolution = options.skipImportResolution || false;
    this.linkerSymbolTable = new LinkerSymbolTable();
    this.collectAllErrors = options.collectAllErrors ?? true;
    this.initializeBuiltins();
  }

  public getCurrentScope(): SymbolTable {
    return this.currentScope;
  }

  // ========== Abstract methods - implemented by checker modules ==========
  abstract checkExpression(expr: AST.Expression): AST.TypeNode | undefined;
  abstract checkStatement(stmt: AST.Statement): void;

  // ========== Type Resolution ==========

  public resolveType(
    type: AST.TypeNode,
    checkConstraints: boolean = true,
  ): AST.TypeNode {
    if (type.kind === "BasicType") {
      if (type.arrayDimensions) {
        for (const dim of type.arrayDimensions) {
          if (dim !== null && dim <= 0) {
            throw new CompilerError(
              "Array size must be greater than zero.",
              "Arrays cannot have zero or negative size.",
              type.location,
            );
          }
        }
      }

      const symbol = this.currentScope.resolve(type.name);
      let resolvedSymbol = symbol;

      if (!resolvedSymbol && type.name.includes(".")) {
        const parts = type.name.split(".");
        let currentScope = this.currentScope;
        let currentSymbol: Symbol | undefined;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!;
          currentSymbol = currentScope.resolve(part);
          if (!currentSymbol) {
            break;
          }

          if (i < parts.length - 1) {
            if (currentSymbol.moduleScope) {
              currentScope = currentSymbol.moduleScope;
            } else {
              currentSymbol = undefined;
              break;
            }
          }
        }
        resolvedSymbol = currentSymbol;
      }

      if (
        checkConstraints &&
        resolvedSymbol &&
        (resolvedSymbol.kind === "Struct" ||
          resolvedSymbol.kind === "Enum" ||
          resolvedSymbol.kind === "TypeAlias" ||
          resolvedSymbol.kind === "Spec")
      ) {
        const decl = resolvedSymbol.declaration as
          | AST.StructDecl
          | AST.EnumDecl
          | AST.TypeAliasDecl
          | AST.SpecDecl;

        const genericParams = decl.genericParams || [];

        if (type.genericArgs.length !== genericParams.length) {
          // Special case for Option.Some(42) where generic args are inferred later.
          // If we are resolving the type of the Enum SYMBOL used as a value (e.g. Option.Some), it might not have args yet.

          // Let's check if we are in a context where inference is possible?
          // No, resolveType doesn't know context.

          // Revert to strict check but allow 0 args if it's an Enum (to support Option.Some syntax)
          // The StatementChecker will patch it up later.
          if (resolvedSymbol.kind === "Enum" && type.genericArgs.length === 0) {
            // Allow raw enum type for now, assuming it will be inferred or is used as namespace
          } else {
            throw new CompilerError(
              `Generic type '${type.name}' expects ${genericParams.length} type arguments, but got ${type.genericArgs.length}.`,
              "Check generic argument count.",
              type.location,
            );
          }
        }

        if (genericParams.length > 0) {
          if (type.genericArgs.length === genericParams.length) {
            const resolvedArgs = type.genericArgs.map((t) =>
              this.resolveType(t, true),
            );

            const mapping = new Map<string, AST.TypeNode>();
            for (let i = 0; i < genericParams.length; i++) {
              mapping.set(genericParams[i]!.name, resolvedArgs[i]!);
            }

            for (let i = 0; i < genericParams.length; i++) {
              const param = genericParams[i]!;
              const arg = resolvedArgs[i]!;

              // Check for void type argument
              if (
                arg.kind === "BasicType" &&
                arg.name === "void" &&
                arg.pointerDepth === 0
              ) {
                this.addError(
                  new CompilerError(
                    `Generic type argument cannot be 'void'.`,
                    "Use '*void' for void pointers.",
                    type.location,
                  ),
                );
              }

              if (param.constraint) {
                const substitutedConstraint = this.substituteType(
                  param.constraint,
                  mapping,
                );
                if (
                  !this.areTypesCompatible(substitutedConstraint, arg, false)
                ) {
                  throw new CompilerError(
                    `Type '${this.typeToString(
                      arg,
                    )}' does not satisfy constraint '${this.typeToString(substitutedConstraint)}'`,
                    `Ensure the type argument satisfies the constraint.`,
                    type.location,
                  );
                }
              }
            }
          }
        }
      }

      if (resolvedSymbol && resolvedSymbol.kind === "Struct") {
        const resolvedArgs = type.genericArgs.map((t) =>
          this.resolveType(t, checkConstraints),
        );

        const basicType = { ...type } as AST.BasicTypeNode;
        basicType.name = resolvedSymbol.name;
        basicType.resolvedDeclaration =
          resolvedSymbol.declaration as AST.StructDecl;
        basicType.genericArgs = resolvedArgs;

        return basicType;
      }

      if (resolvedSymbol && resolvedSymbol.kind === "Enum") {
        const resolvedArgs = type.genericArgs.map((t) =>
          this.resolveType(t, checkConstraints),
        );

        const basicType = { ...type } as AST.BasicTypeNode;
        basicType.name = resolvedSymbol.name;
        basicType.resolvedDeclaration =
          resolvedSymbol.declaration as AST.EnumDecl;
        basicType.genericArgs = resolvedArgs;

        return basicType;
      }

      if (resolvedSymbol && resolvedSymbol.kind === "Spec") {
        const resolvedArgs = type.genericArgs.map((t) =>
          this.resolveType(t, checkConstraints),
        );

        const basicType = { ...type } as AST.BasicTypeNode;
        basicType.name = resolvedSymbol.name;
        basicType.resolvedDeclaration =
          resolvedSymbol.declaration as AST.SpecDecl;
        basicType.genericArgs = resolvedArgs;

        return basicType;
      }

      if (
        resolvedSymbol &&
        resolvedSymbol.kind === "TypeAlias" &&
        resolvedSymbol.type
      ) {
        // If the alias points to itself (base type definition), return it
        if (
          resolvedSymbol.type.kind === "BasicType" &&
          resolvedSymbol.type.name === type.name
        ) {
          // Attach declaration if available (e.g. for GenericParam)
          if (resolvedSymbol.declaration) {
            const res = { ...type } as AST.BasicTypeNode;
            res.resolvedDeclaration = resolvedSymbol.declaration as
              | AST.StructDecl
              | AST.EnumDecl
              | AST.SpecDecl;
            return res;
          }
          return type;
        }

        const decl = resolvedSymbol.declaration as AST.TypeAliasDecl;
        if (decl && decl.genericParams && decl.genericParams.length > 0) {
          // Generic Alias Substitution
          if (type.genericArgs.length !== decl.genericParams.length) {
            throw new CompilerError(
              `Generic alias '${type.name}' expects ${decl.genericParams.length} type arguments, but got ${type.genericArgs.length}.`,
              "Check generic argument count.",
              type.location,
            );
          }

          const typeMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < decl.genericParams.length; i++) {
            typeMap.set(
              decl.genericParams[i]!.name,
              this.resolveType(type.genericArgs[i]!, checkConstraints),
            );
          }

          const substituted = this.substituteType(resolvedSymbol.type, typeMap);
          const resolvedSubstituted = this.resolveType(
            substituted,
            checkConstraints,
          );

          if (resolvedSubstituted.kind === "BasicType") {
            return {
              ...resolvedSubstituted,
              pointerDepth:
                resolvedSubstituted.pointerDepth + type.pointerDepth,
              arrayDimensions: [
                ...resolvedSubstituted.arrayDimensions,
                ...type.arrayDimensions,
              ],
              location: type.location,
              aliasDeclaration: decl,
            };
          }
          return resolvedSubstituted;
        }

        const resolvedBase = this.resolveType(
          resolvedSymbol.type,
          checkConstraints,
        );

        if (resolvedBase.kind === "BasicType") {
          const result: AST.BasicTypeNode = {
            ...resolvedBase,
            genericArgs: [
              ...resolvedBase.genericArgs,
              ...type.genericArgs.map((t) =>
                this.resolveType(t, checkConstraints),
              ),
            ],
            pointerDepth: resolvedBase.pointerDepth + type.pointerDepth,
            arrayDimensions: [
              ...resolvedBase.arrayDimensions,
              ...type.arrayDimensions,
            ],
            location: type.location,
            isConst: type.isConst || resolvedBase.isConst,
            aliasDeclaration: decl,
          };
          return result;
        }

        // Propagate array dimensions for other types (FunctionType, TupleType, LambdaType)
        if (
          resolvedBase.kind === "FunctionType" ||
          resolvedBase.kind === "TupleType" ||
          resolvedBase.kind === "LambdaType"
        ) {
          const result = { ...resolvedBase } as any;
          if (type.arrayDimensions && type.arrayDimensions.length > 0) {
            result.arrayDimensions = [
              ...(result.arrayDimensions || []),
              ...type.arrayDimensions,
            ];
          }
          if ("isConst" in type && type.isConst) {
            result.isConst = true;
          }
          return result as AST.TypeNode;
        }

        // Propagate const for other types
        if ("isConst" in type && type.isConst) {
          return { ...resolvedBase, isConst: true } as AST.TypeNode;
        }
        return resolvedBase;
      }
    } else if (type.kind === "FunctionType") {
      return {
        ...type,
        returnType: this.resolveType(type.returnType, checkConstraints),
        paramTypes: type.paramTypes.map((p) =>
          this.resolveType(p, checkConstraints),
        ),
      };
    } else if (type.kind === "TupleType") {
      return {
        ...type,
        types: type.types.map((t) => this.resolveType(t, checkConstraints)),
      };
    } else if (type.kind === "LambdaType") {
      return {
        ...type,
        returnType: this.resolveType(type.returnType, checkConstraints),
        paramTypes: type.paramTypes.map((p) =>
          this.resolveType(p, checkConstraints),
        ),
      };
    }
    return type;
  }

  public substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode {
    return TypeSubstitution.substituteType(type, map);
  }

  // ========== Public API ==========

  registerModule(modulePath: string, ast: AST.Program): void {
    this.preLoadedModules.set(modulePath, ast);
  }

  setCurrentModulePath(modulePath: string): void {
    this.currentModulePath = modulePath;
  }

  getLinkerSymbolTable(): LinkerSymbolTable {
    return this.linkerSymbolTable;
  }

  getErrors(): CompilerError[] {
    return this.errors;
  }

  // ========== Initialization ==========

  protected initializeBuiltins(): void {
    initializeBuiltinsInScope(this.globalScope);
  }

  // ========== Linker Symbol Registration ==========

  protected registerLinkerSymbol(
    name: string,
    kind: "function" | "variable" | "type",
    type?: AST.TypeNode,
    declaration?: AST.ASTNode,
    isExtern: boolean = false,
  ): void {
    this.linkerSymbolTable.defineSymbol({
      name,
      kind,
      module: this.currentModulePath,
      isExported: false,
      type,
      declaration,
      isExtern,
      location: declaration?.location,
    });
  }

  // ========== Type Utilities ==========

  public typeToString(type: AST.TypeNode | undefined): string {
    return TypeUtils.typeToString(type);
  }

  public isIntegerType(type: AST.TypeNode): boolean {
    return TypeUtils.isIntegerType(type);
  }

  public isComparisonOperator(op: TokenType): boolean {
    return TypeUtils.isComparisonOperator(op);
  }

  public isBoolType(type: AST.TypeNode): boolean {
    return TypeUtils.isBoolType(type);
  }

  public makeVoidType(): AST.TypeNode {
    return TypeUtils.makeVoidType();
  }

  public getIntegerConstantValue(expr: AST.Expression): bigint | undefined {
    const val = TypeUtils.getIntegerConstantValue(expr);
    if (val !== undefined) return val;

    // Handle Enum variants: Enum.Variant
    // Removed to enforce strict type checking for enums

    return undefined;
  }

  public getEnumVariantIndex(expr: AST.Expression): number | undefined {
    if (expr.kind === "Member") {
      const memberExpr = expr as AST.MemberExpr;
      if (memberExpr.object.kind === "Identifier") {
        const symbol = this.currentScope.resolve(
          (memberExpr.object as AST.IdentifierExpr).name,
        );
        if (symbol && symbol.kind === "Enum") {
          const enumDecl = symbol.declaration as AST.EnumDecl;
          const variantName = memberExpr.property;
          const index = enumDecl.variants.findIndex(
            (v) => v.name === variantName,
          );
          if (index !== -1) {
            return index;
          }
        }
      }
    }
    return undefined;
  }

  public isIntegerTypeCompatible(
    val: bigint,
    targetType: AST.TypeNode,
  ): boolean {
    return TypeUtils.isIntegerTypeCompatible(val, targetType, (t) =>
      this.resolveType(t),
    );
  }

  public getIntegerSize(type: AST.TypeNode): number {
    return TypeUtils.getIntegerSize(type);
  }

  // ========== Symbol Management ==========

  public defineSymbol(
    name: string,
    kind: SymbolKind,
    type: AST.TypeNode | undefined,
    node: AST.ASTNode,
    moduleScope?: SymbolTable,
    isConst?: boolean,
  ): void {
    const existing = this.currentScope.getInCurrentScope(name);

    if (
      existing &&
      existing.kind === "Function" &&
      kind === "Function" &&
      type &&
      type.kind === "FunctionType"
    ) {
      const candidates = [existing, ...(existing.overloads || [])];
      for (const cand of candidates) {
        if (cand.type && cand.type.kind === "FunctionType") {
          if (
            this.areSignaturesEqual(
              cand.type as AST.FunctionTypeNode,
              type as AST.FunctionTypeNode,
            )
          ) {
            throw new CompilerError(
              `Function '${name}' with this signature is already defined.`,
              "Overloads must have different parameter types.",
              node.location,
            );
          }
        }
      }
    }

    this.currentScope.define({
      name,
      kind,
      type,
      declaration: node,
      moduleScope,
      isConst,
    });
  }

  public defineImportedSymbol(
    name: string,
    symbol: Symbol,
    scope?: SymbolTable,
  ): void {
    const targetScope = scope || this.currentScope;

    targetScope.define({
      name,
      kind: symbol.kind,
      type: symbol.type,
      declaration: symbol.declaration,
      moduleScope: symbol.moduleScope,
    });

    if (symbol.overloads) {
      for (const overload of symbol.overloads) {
        targetScope.define({
          name,
          kind: overload.kind,
          type: overload.type,
          declaration: overload.declaration,
          moduleScope: overload.moduleScope,
        });
      }
    }
  }

  // ========== Type Resolution ==========

  // ========== Type Compatibility ==========

  public getIntegerBits(typeName: string): number {
    return TypeUtils.getIntegerBits(typeName);
  }

  public areTypesCompatible(
    t1: AST.TypeNode,
    t2: AST.TypeNode,
    checkConstraints: boolean = true,
  ): boolean {
    const rt1 = this.resolveType(t1, checkConstraints);
    const rt2 = this.resolveType(t2, checkConstraints);

    if (rt1.kind !== rt2.kind) {
      // Allow FunctionType vs LambdaType
      const isFuncOrLambda1 =
        rt1.kind === "FunctionType" || rt1.kind === "LambdaType";
      const isFuncOrLambda2 =
        rt2.kind === "FunctionType" || rt2.kind === "LambdaType";

      if (!isFuncOrLambda1 || !isFuncOrLambda2) {
        return false;
      }
    }

    if (rt1.kind === "BasicType" && rt2.kind === "BasicType") {
      // nullptr handling
      if (rt1.name === "nullptr" && rt2.name === "nullptr") return true;
      if (rt2.name === "nullptr") return rt1.pointerDepth > 0;
      if (rt1.name === "nullptr") return rt2.pointerDepth > 0;

      // null handling
      if (rt1.name === "null" || rt2.name === "null") {
        const other = rt1.name === "null" ? rt2 : rt1;
        if (other.pointerDepth > 0) return true;
        return other.pointerDepth === 0 && this.isStructType(other.name);
      }

      // Void handling
      if (rt1.name === "void" && rt2.name === "void") return true;

      // void* compatibility
      if (
        (rt1.name === "void" || rt2.name === "void") &&
        rt1.pointerDepth > 0 &&
        rt2.pointerDepth > 0
      ) {
        return true;
      }

      // Check integer compatibility (implicit casts)
      const size1 = this.getIntegerBits(rt1.name);
      const size2 = this.getIntegerBits(rt2.name);

      if (
        size1 > 0 &&
        size2 > 0 &&
        rt1.pointerDepth === 0 &&
        rt2.pointerDepth === 0 &&
        rt1.arrayDimensions.length === 0 &&
        rt2.arrayDimensions.length === 0
      ) {
        return true;
      }

      // Exact name match or inheritance
      if (rt1.name !== rt2.name) {
        // Check aliases
        const aliases: { [key: string]: string } = {
          long: "i64",
          ulong: "u64",
          int: "i32",
          uint: "u32",
          short: "i16",
          ushort: "u16",
          char: "i8",
          uchar: "u8",
        };
        const n1 = aliases[rt1.name] || rt1.name;
        const n2 = aliases[rt2.name] || rt2.name;
        const isAlias = n1 === n2;

        if (
          !isAlias &&
          !this.isSubtype(rt2 as AST.BasicTypeNode, rt1 as AST.BasicTypeNode)
        ) {
          return false;
        }

        // If subtype, check against the instantiated super type
        if (!isAlias) {
          const superType = this.getSuperType(
            rt2 as AST.BasicTypeNode,
            rt1.name,
          );
          if (superType) {
            // Propagate pointer depth and array dimensions from the child type
            const adjustedSuperType = {
              ...superType,
              pointerDepth: superType.pointerDepth + rt2.pointerDepth,
              arrayDimensions: [
                ...superType.arrayDimensions,
                ...rt2.arrayDimensions,
              ],
            };
            return this.areTypesCompatible(
              rt1,
              adjustedSuperType,
              checkConstraints,
            );
          }
        }
      }

      // Check generic arguments compatibility
      const symbol1 = this.currentScope.resolve(rt1.name);
      let isWildcard = false;
      if (symbol1 && (symbol1.kind === "Struct" || symbol1.kind === "Enum")) {
        const decl = symbol1.declaration as AST.StructDecl | AST.EnumDecl;
        if (decl.genericParams && decl.genericParams.length > 0) {
          if (rt1.genericArgs.length === 0 || rt2.genericArgs.length === 0) {
            isWildcard = true;
          }
        }
      }

      // Pointer depth match
      if (rt1.pointerDepth !== rt2.pointerDepth) {
        if (
          rt1.pointerDepth === rt2.pointerDepth + 1 &&
          rt2.arrayDimensions.length > 0 &&
          rt1.arrayDimensions.length === rt2.arrayDimensions.length - 1
        ) {
          // array decay
        } else {
          return false;
        }
      } else {
        if (rt1.arrayDimensions.length !== rt2.arrayDimensions.length) {
          return false;
        }
        for (let i = 0; i < rt1.arrayDimensions.length; i++) {
          if (rt1.arrayDimensions[i] !== rt2.arrayDimensions[i]) {
            return false;
          }
        }
      }

      // Generic args match
      if (!isWildcard) {
        if (rt1.genericArgs.length !== rt2.genericArgs.length) {
          return false;
        }
        for (let i = 0; i < rt1.genericArgs.length; i++) {
          if (
            !this.areTypesCompatible(rt1.genericArgs[i]!, rt2.genericArgs[i]!)
          ) {
            return false;
          }
        }
      }

      return true;
    } else if (
      (rt1.kind === "FunctionType" || rt1.kind === "LambdaType") &&
      (rt2.kind === "FunctionType" || rt2.kind === "LambdaType")
    ) {
      // Func <- Lambda : Error (unless stateless, but that's handled by checkLambda returning Func)
      if (rt1.kind === "FunctionType" && rt2.kind === "LambdaType") {
        return false;
      }

      const f1 = rt1 as AST.FunctionTypeNode | AST.LambdaTypeNode;
      const f2 = rt2 as AST.FunctionTypeNode | AST.LambdaTypeNode;

      if (!this.areTypesCompatible(f1.returnType, f2.returnType)) return false;
      if (f1.paramTypes.length !== f2.paramTypes.length) return false;
      for (let i = 0; i < f1.paramTypes.length; i++) {
        if (!this.areTypesCompatible(f1.paramTypes[i]!, f2.paramTypes[i]!))
          return false;
      }
      return true;
    } else if (rt1.kind === "TupleType" && rt2.kind === "TupleType") {
      if (rt1.types.length !== rt2.types.length) return false;
      for (let i = 0; i < rt1.types.length; i++) {
        if (!this.areTypesCompatible(rt1.types[i]!, rt2.types[i]!))
          return false;
      }
      return true;
    }

    return false;
  }

  public areTypesExactMatch(t1: AST.TypeNode, t2: AST.TypeNode): boolean {
    const rt1 = this.resolveType(t1, false);
    const rt2 = this.resolveType(t2, false);

    if (rt1.kind !== rt2.kind) return false;

    if (rt1.kind === "BasicType" && rt2.kind === "BasicType") {
      if (rt1.name !== rt2.name) return false;
      if (rt1.pointerDepth !== rt2.pointerDepth) return false;
      if (rt1.arrayDimensions.length !== rt2.arrayDimensions.length)
        return false;
      for (let i = 0; i < rt1.arrayDimensions.length; i++) {
        if (rt1.arrayDimensions[i] !== rt2.arrayDimensions[i]) return false;
      }
      if (rt1.genericArgs.length !== rt2.genericArgs.length) return false;
      for (let i = 0; i < rt1.genericArgs.length; i++) {
        if (!this.areTypesExactMatch(rt1.genericArgs[i]!, rt2.genericArgs[i]!))
          return false;
      }
      return true;
    } else if (rt1.kind === "FunctionType" && rt2.kind === "FunctionType") {
      if (!this.areTypesExactMatch(rt1.returnType, rt2.returnType))
        return false;
      if (rt1.paramTypes.length !== rt2.paramTypes.length) return false;
      for (let i = 0; i < rt1.paramTypes.length; i++) {
        if (!this.areTypesExactMatch(rt1.paramTypes[i]!, rt2.paramTypes[i]!))
          return false;
      }
      return true;
    } else if (rt1.kind === "TupleType" && rt2.kind === "TupleType") {
      if (rt1.types.length !== rt2.types.length) return false;
      for (let i = 0; i < rt1.types.length; i++) {
        if (!this.areTypesExactMatch(rt1.types[i]!, rt2.types[i]!))
          return false;
      }
      return true;
    }

    return false;
  }

  public areSignaturesEqual(
    f1: AST.FunctionTypeNode,
    f2: AST.FunctionTypeNode,
  ): boolean {
    if (f1.paramTypes.length !== f2.paramTypes.length) return false;
    for (let i = 0; i < f1.paramTypes.length; i++) {
      if (!this.areTypesExactMatch(f1.paramTypes[i]!, f2.paramTypes[i]!))
        return false;
    }
    return true;
  }

  // ========== Struct/Type Helpers ==========

  public isStructType(typeName: string): boolean {
    const symbol = this.currentScope.resolve(typeName);
    return symbol !== undefined && symbol.kind === "Struct";
  }

  public getSuperType(
    child: AST.BasicTypeNode,
    parentName: string,
  ): AST.BasicTypeNode | undefined {
    if (child.name === parentName) return child;

    const childSymbol = this.currentScope.resolve(child.name);
    if (!childSymbol || childSymbol.kind !== "Struct") return undefined;

    const childDecl = childSymbol.declaration as AST.StructDecl;
    if (!childDecl.inheritanceList || childDecl.inheritanceList.length === 0)
      return undefined;

    const parentType = childDecl.inheritanceList[0] as AST.BasicTypeNode;

    // Instantiate parent type if child is generic
    let instantiatedParent = parentType;
    if (
      childDecl.genericParams.length > 0 &&
      child.genericArgs.length > 0 &&
      childDecl.genericParams.length <= child.genericArgs.length
    ) {
      const map = new Map<string, AST.TypeNode>();
      for (let i = 0; i < childDecl.genericParams.length; i++) {
        map.set(childDecl.genericParams[i]!.name, child.genericArgs[i]!);
      }
      instantiatedParent = this.substituteType(
        parentType,
        map,
      ) as AST.BasicTypeNode;
    }

    if (instantiatedParent.name === parentName) return instantiatedParent;

    return this.getSuperType(instantiatedParent, parentName);
  }

  public isSubtype(
    child: AST.BasicTypeNode,
    parent: AST.BasicTypeNode,
  ): boolean {
    if (child.name === parent.name) return true;

    const childSymbol = this.currentScope.resolve(child.name);
    if (!childSymbol) return false;

    if (childSymbol.kind === "TypeAlias") {
      const aliasDecl = childSymbol.declaration;
      if (
        (aliasDecl.kind === "GenericParam" || !aliasDecl.kind) &&
        "constraint" in aliasDecl
      ) {
        const gp = aliasDecl as unknown as AST.GenericParam;
        if (gp.constraint && gp.constraint.kind === "BasicType") {
          return this.isSubtype(gp.constraint as AST.BasicTypeNode, parent);
        }
      }
    }

    if (childSymbol.kind !== "Struct") return false;

    const childDecl = childSymbol.declaration as AST.StructDecl;
    if (!childDecl.inheritanceList || childDecl.inheritanceList.length === 0)
      return false;

    // First element in inheritanceList is the parent struct (if any)
    const parentType = childDecl.inheritanceList[0] as AST.BasicTypeNode;
    if (parentType.name === parent.name) return true;

    // Check inheritance chain
    let current: AST.BasicTypeNode | undefined = parentType;
    while (current) {
      if (current.name === parent.name) return true;
      const currentSymbol = this.currentScope.resolve(current.name);
      if (!currentSymbol || currentSymbol.kind !== "Struct") break;
      const currentDecl = currentSymbol.declaration as AST.StructDecl;
      if (
        !currentDecl.inheritanceList ||
        currentDecl.inheritanceList.length === 0
      )
        break;
      current = currentDecl.inheritanceList[0] as AST.BasicTypeNode | undefined;
    }

    return false;
  }

  public resolveStructField(
    decl: AST.StructDecl,
    fieldName: string,
    substitutionMap: Map<string, AST.TypeNode> = new Map(),
  ): { field: AST.StructField; type: AST.TypeNode } | undefined {
    for (const member of decl.members) {
      if (member.kind === "StructField" && member.name === fieldName) {
        return {
          field: member,
          type: this.substituteType(member.type, substitutionMap),
        };
      }
    }

    if (decl.inheritanceList && decl.inheritanceList.length > 0) {
      const parentType = decl.inheritanceList[0];
      if (parentType && parentType.kind === "BasicType") {
        const parentSymbol = this.currentScope.resolve(parentType.name);
        if (parentSymbol && parentSymbol.kind === "Struct") {
          const parentDecl = parentSymbol.declaration as AST.StructDecl;

          // Update substitution map with parent's generic args
          const newMap = new Map(substitutionMap);
          if (
            parentDecl.genericParams &&
            parentType.genericArgs &&
            parentType.genericArgs.length > 0
          ) {
            for (let i = 0; i < parentDecl.genericParams.length; i++) {
              if (i < parentType.genericArgs.length) {
                const paramName = parentDecl.genericParams[i]!.name;
                const argType = parentType.genericArgs[i]!;
                // Substitute the argument with the current context
                const substitutedArg = this.substituteType(
                  argType,
                  substitutionMap,
                );
                newMap.set(paramName, substitutedArg);
              }
            }
          }

          return this.resolveStructField(parentDecl, fieldName, newMap);
        }
      }
    }

    return undefined;
  }

  public resolveMemberWithContext(
    baseType: AST.BasicTypeNode,
    memberName: string,
  ):
    | {
        decl: AST.StructDecl | AST.SpecDecl | AST.EnumDecl;
        members: (AST.StructField | AST.FunctionDecl | AST.SpecMethod)[];
        genericMap: Map<string, AST.TypeNode>;
      }
    | undefined {
    let decl: AST.StructDecl | AST.SpecDecl | AST.EnumDecl | undefined;

    if (
      baseType.resolvedDeclaration &&
      ((baseType.resolvedDeclaration as any).kind === "StructDecl" ||
        (baseType.resolvedDeclaration as any).kind === "SpecDecl" ||
        (baseType.resolvedDeclaration as any).kind === "EnumDecl")
    ) {
      decl = baseType.resolvedDeclaration as
        | AST.StructDecl
        | AST.SpecDecl
        | AST.EnumDecl;
    } else {
      // Check if it's a primitive type that maps to a struct
      if (PRIMITIVE_STRUCT_MAP[baseType.name]) {
        const structName = PRIMITIVE_STRUCT_MAP[baseType.name]!;
        const symbol = this.currentScope.resolve(structName);
        if (symbol && symbol.kind === "Struct") {
          decl = symbol.declaration as AST.StructDecl;
        }
      }

      if (!decl) {
        const symbol = this.currentScope.resolve(baseType.name);
        if (symbol) {
          if (symbol.kind === "Struct") {
            decl = symbol.declaration as AST.StructDecl;
          } else if (symbol.kind === "Enum") {
            decl = symbol.declaration as AST.EnumDecl;
          } else if (symbol.kind === "Spec") {
            decl = symbol.declaration as AST.SpecDecl;
          } else if (symbol.kind === "TypeAlias") {
            // Check if it's a generic parameter with a constraint
            const aliasDecl = symbol.declaration;
            // GenericParam interface doesn't have 'kind' property, so we check for constraint existence
            // or if it happens to have kind="GenericParam" (future proofing)
            if (
              (aliasDecl.kind === "GenericParam" || !aliasDecl.kind) &&
              "constraint" in aliasDecl
            ) {
              const gp = aliasDecl as unknown as AST.GenericParam;
              if (gp.constraint && gp.constraint.kind === "BasicType") {
                return this.resolveMemberWithContext(
                  gp.constraint as AST.BasicTypeNode,
                  memberName,
                );
              }
            }
          }
        }
      }
    }

    if (!decl) {
      return undefined;
    }

    let members: (AST.StructField | AST.FunctionDecl | AST.SpecMethod)[] = [];

    if (decl.kind === "StructDecl") {
      members = (decl as AST.StructDecl).members.filter(
        (m) =>
          (m.kind === "StructField" && m.name === memberName) ||
          (m.kind === "FunctionDecl" && m.name === memberName),
      );
    } else if (decl.kind === "EnumDecl") {
      members = (decl as AST.EnumDecl).methods.filter(
        (m) => m.name === memberName,
      );
    } else {
      members = (decl as AST.SpecDecl).methods.filter(
        (m) => m.name === memberName,
      );
    }

    if (members.length > 0) {
      const genericMap = new Map<string, AST.TypeNode>();
      if (decl.genericParams.length > 0 && baseType.genericArgs.length > 0) {
        for (let i = 0; i < decl.genericParams.length; i++) {
          genericMap.set(decl.genericParams[i]!.name, baseType.genericArgs[i]!);
        }
      }

      if (decl.kind === "SpecDecl") {
        // Map Self to the spec type itself when accessing members on the spec type
        genericMap.set("Self", baseType);
      }

      return { decl, members, genericMap };
    }

    // Check parent struct via inheritanceList
    if (
      decl.kind === "StructDecl" &&
      decl.inheritanceList &&
      decl.inheritanceList.length > 0
    ) {
      let parentType = decl.inheritanceList[0];
      if (parentType && parentType.kind === "BasicType") {
        // Substitute generics in parent type if we have a map
        const currentGenericMap = new Map<string, AST.TypeNode>();
        if (decl.genericParams.length > 0 && baseType.genericArgs.length > 0) {
          for (let i = 0; i < decl.genericParams.length; i++) {
            currentGenericMap.set(
              decl.genericParams[i]!.name,
              baseType.genericArgs[i]!,
            );
          }
        }

        if (currentGenericMap.size > 0) {
          parentType = this.substituteType(
            parentType,
            currentGenericMap,
          ) as AST.BasicTypeNode;
        }

        return this.resolveMemberWithContext(
          parentType as AST.BasicTypeNode,
          memberName,
        );
      }
    }

    return undefined;
  }

  // ========== Cast Checking ==========

  public isCastAllowed(source: AST.TypeNode, target: AST.TypeNode): boolean {
    const resolvedSource = this.resolveType(source);
    const resolvedTarget = this.resolveType(target);

    if (this.areTypesCompatible(resolvedSource, resolvedTarget)) {
      return true;
    }

    // Allow casting if source or target is a generic parameter
    if (
      (resolvedSource.kind === "BasicType" &&
        resolvedSource.resolvedDeclaration &&
        (resolvedSource.resolvedDeclaration as any).kind === "GenericParam") ||
      (resolvedTarget.kind === "BasicType" &&
        resolvedTarget.resolvedDeclaration &&
        (resolvedTarget.resolvedDeclaration as any).kind === "GenericParam")
    ) {
      return true;
    }

    // Allow casting between function pointers and void pointers (or any pointer)
    if (
      (resolvedSource.kind === "FunctionType" &&
        resolvedTarget.kind === "BasicType" &&
        resolvedTarget.pointerDepth > 0) ||
      (resolvedSource.kind === "BasicType" &&
        resolvedSource.pointerDepth > 0 &&
        resolvedTarget.kind === "FunctionType")
    ) {
      return true;
    }

    if (
      resolvedSource.kind === "BasicType" &&
      resolvedTarget.kind === "BasicType"
    ) {
      // Numeric casts
      if (
        NUMERIC_TYPES.includes(resolvedSource.name) &&
        NUMERIC_TYPES.includes(resolvedTarget.name) &&
        resolvedSource.pointerDepth === 0 &&
        resolvedTarget.pointerDepth === 0
      ) {
        return true;
      }

      // Struct upcasting
      if (
        resolvedSource.pointerDepth === 0 &&
        resolvedTarget.pointerDepth === 0 &&
        resolvedSource.resolvedDeclaration &&
        resolvedSource.resolvedDeclaration.kind === "StructDecl" &&
        resolvedTarget.resolvedDeclaration &&
        resolvedTarget.resolvedDeclaration.kind === "StructDecl"
      ) {
        if (this.isSubtype(resolvedSource, resolvedTarget)) {
          return true;
        }
      }

      // Struct <-> Primitive inheritance
      if (
        resolvedSource.pointerDepth === 0 &&
        resolvedTarget.pointerDepth === 0
      ) {
        // Case 1: Struct -> Primitive (e.g. MyInt -> int)
        if (
          resolvedSource.kind === "BasicType" &&
          resolvedSource.resolvedDeclaration &&
          resolvedSource.resolvedDeclaration.kind === "StructDecl" &&
          resolvedTarget.kind === "BasicType"
        ) {
          const structDecl =
            resolvedSource.resolvedDeclaration as AST.StructDecl;
          if (
            structDecl.inheritanceList &&
            structDecl.inheritanceList.length > 0
          ) {
            // Check if the first inherited type is the target primitive
            const parent = structDecl.inheritanceList[0]!;
            const resolvedParent = this.resolveType(parent);

            // Fix: Ensure parent is not a struct (to avoid matching implicit 'Type' inheritance)
            if (
              resolvedParent.kind === "BasicType" &&
              !this.isStructType(resolvedParent.name) &&
              this.areTypesCompatible(resolvedParent, resolvedTarget)
            ) {
              return true;
            }
          }
        }

        // Case 2: Primitive -> Struct (e.g. int -> MyInt)
        if (
          resolvedTarget.kind === "BasicType" &&
          resolvedTarget.resolvedDeclaration &&
          resolvedTarget.resolvedDeclaration.kind === "StructDecl" &&
          resolvedSource.kind === "BasicType"
        ) {
          const structDecl =
            resolvedTarget.resolvedDeclaration as AST.StructDecl;
          if (
            structDecl.inheritanceList &&
            structDecl.inheritanceList.length > 0
          ) {
            // Check if the first inherited type is the source primitive
            const parent = structDecl.inheritanceList[0]!;
            const resolvedParent = this.resolveType(parent);

            // Fix: Ensure parent is not a struct
            if (
              resolvedParent.kind === "BasicType" &&
              !this.isStructType(resolvedParent.name) &&
              this.areTypesCompatible(resolvedParent, resolvedSource)
            ) {
              return true;
            }
          }
        }
      }

      // Pointer casts
      if (resolvedSource.pointerDepth > 0 && resolvedTarget.pointerDepth > 0) {
        return true;
      }

      // Pointer to int / int to pointer
      if (
        (resolvedSource.pointerDepth > 0 &&
          ["i64", "u64", "long", "ulong", "int", "uint", "i32", "u32"].includes(
            resolvedTarget.name,
          )) ||
        (resolvedTarget.pointerDepth > 0 &&
          ["i64", "u64", "long", "ulong", "int", "uint", "i32", "u32"].includes(
            resolvedSource.name,
          ))
      ) {
        return true;
      }
    }

    return false;
  }

  public isImplicitWideningAllowed(
    source: AST.TypeNode,
    target: AST.TypeNode,
  ): boolean {
    return TypeUtils.isImplicitWideningAllowed(source, target, (t) =>
      this.resolveType(t),
    );
  }

  // ========== Scope Management ==========

  public enterScope(): void {
    this.currentScope = this.currentScope.enterScope();
  }

  public exitScope(): void {
    this.currentScope = this.currentScope.exitScope();
  }

  public addError(error: CompilerError): void {
    if (this.collectAllErrors) {
      this.errors.push(error);
    } else {
      throw error;
    }
  }
}
