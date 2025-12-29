/**
 * Operator overload resolution for the BPL type checker
 * Handles operator method lookup and overload resolution
 */

import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";
import type { Symbol, SymbolTable } from "./SymbolTable";

/**
 * Operator to method name mapping for operator overloading
 */
export const OPERATOR_METHOD_MAP: Record<string, string> = {
  // Binary Arithmetic
  "+": "__add__",
  "-": "__sub__",
  "*": "__mul__",
  "/": "__div__",
  "%": "__mod__",

  // Binary Bitwise
  "&": "__and__",
  "|": "__or__",
  "^": "__xor__",
  "<<": "__lshift__",
  ">>": "__rshift__",

  // Comparison
  "==": "__eq__",
  "!=": "__ne__",
  "<": "__lt__",
  ">": "__gt__",
  "<=": "__le__",
  ">=": "__ge__",

  // Unary (prefixed with "unary" to distinguish from binary)
  "unary-": "__neg__",
  "unary~": "__not__",
  "unary+": "__pos__",
};

/**
 * Overload resolution context
 */
export interface OverloadResolutionContext {
  resolveType: (type: AST.TypeNode, checkConstraints?: boolean) => AST.TypeNode;
  areTypesCompatible: (
    t1: AST.TypeNode,
    t2: AST.TypeNode,
    checkConstraints?: boolean,
  ) => boolean;
  areTypesExactMatch: (t1: AST.TypeNode, t2: AST.TypeNode) => boolean;
  isImplicitWideningAllowed: (
    source: AST.TypeNode,
    target: AST.TypeNode,
  ) => boolean;
  substituteType: (
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ) => AST.TypeNode;
  typeToString: (type: AST.TypeNode | undefined) => string;
  getCurrentScope: () => SymbolTable;
}

/**
 * Overload resolver for function and operator overloads
 */
export class OverloadResolver {
  private ctx: OverloadResolutionContext;

  constructor(context: OverloadResolutionContext) {
    this.ctx = context;
  }

  /**
   * Check if two function signatures are equal (same parameter types)
   */
  areSignaturesEqual(
    a: AST.FunctionTypeNode,
    b: AST.FunctionTypeNode,
  ): boolean {
    if (a.paramTypes.length !== b.paramTypes.length) return false;
    for (let i = 0; i < a.paramTypes.length; i++) {
      if (
        this.ctx.typeToString(a.paramTypes[i]!) !==
        this.ctx.typeToString(b.paramTypes[i]!)
      )
        return false;
    }
    return true;
  }

  /**
   * Resolve the best matching overload for a function call
   */
  resolveOverload(
    name: string,
    candidates: Symbol[],
    argTypes: (AST.TypeNode | undefined)[],
    genericArgs: AST.TypeNode[],
    location: SourceLocation,
  ): {
    symbol: Symbol;
    type: AST.FunctionTypeNode;
    declaration: AST.ASTNode;
    genericArgs?: AST.TypeNode[];
  } {
    const viableCandidates: {
      symbol: Symbol;
      inferredArgs?: AST.TypeNode[];
      isExplicitVariadic?: boolean;
    }[] = [];

    for (const c of candidates) {
      const ft = c.type as AST.FunctionTypeNode;
      const decl = c.declaration as AST.FunctionDecl | AST.ExternDecl;

      let isExplicitVariadic = false;

      // Check param count
      if (ft.isVariadic) {
        if (decl.kind === "Extern") {
          if (argTypes.length < ft.paramTypes.length) continue;
        } else {
          // BPL Variadic: (fixed..., variadic, count)
          // User provides fixed... + variadic args
          // So min args = paramTypes.length - 2
          if (argTypes.length < ft.paramTypes.length - 2) continue;
        }
      } else {
        if (ft.paramTypes.length !== argTypes.length) {
          // Check for explicit variadic signature: (..., args: *Any, count: int)
          const len = ft.paramTypes.length;
          if (len >= 2) {
            const lastParam = ft.paramTypes[len - 1]!;
            const secondLastParam = ft.paramTypes[len - 2]!;

            if (
              this.isIntType(lastParam) &&
              this.isPointerToAny(secondLastParam)
            ) {
              if (argTypes.length >= len - 2) {
                isExplicitVariadic = true;
              }
            }
          }

          if (!isExplicitVariadic) continue;
        }
      }

      if (genericArgs.length > 0) {
        // Explicit generics
        if (decl.kind !== "FunctionDecl") continue;
        if (decl.genericParams.length !== genericArgs.length) continue;
        viableCandidates.push({ symbol: c, isExplicitVariadic });
      } else {
        // No explicit generics
        if (decl.kind === "FunctionDecl" && decl.genericParams.length > 0) {
          // Generic inference is disabled by user request.
          // Only explicit generic arguments are allowed.
          continue;
        } else {
          // Non-generic
          viableCandidates.push({ symbol: c, isExplicitVariadic });
        }
      }
    }

    if (viableCandidates.length === 0) {
      throw new CompilerError(
        `No matching function for call to '${name}' with ${argTypes.length} arguments${
          genericArgs.length > 0
            ? ` and ${genericArgs.length} generic arguments`
            : ""
        }.`,
        `Available overloads:\n${candidates.map((c) => this.ctx.typeToString(c.type!)).join("\n")}`,
        location,
      );
    }

    // Create a list of candidates with substituted types if generic
    const substitutedCandidates = viableCandidates.map((vc) => {
      const c = vc.symbol;
      const decl = c.declaration as AST.FunctionDecl | AST.ExternDecl;
      const args = genericArgs.length > 0 ? genericArgs : vc.inferredArgs;

      if (args && decl.kind === "FunctionDecl") {
        const map = new Map<string, AST.TypeNode>();
        for (let i = 0; i < decl.genericParams.length; i++) {
          const param = decl.genericParams[i]!;
          const arg = args[i]!;
          map.set(param.name, arg);

          // Check constraint
          if (param.constraint) {
            const substitutedConstraint = this.ctx.substituteType(
              param.constraint,
              map,
            );
            if (
              !this.ctx.areTypesCompatible(substitutedConstraint, arg, false)
            ) {
              throw new CompilerError(
                `Type argument '${this.ctx.typeToString(arg)}' does not satisfy constraint '${this.ctx.typeToString(substitutedConstraint)}'`,
                "Ensure the type argument satisfies the constraint.",
                location,
              );
            }
          }
        }
        const sub = this.ctx.substituteType(
          c.type!,
          map,
        ) as AST.FunctionTypeNode;

        const finalType = vc.isExplicitVariadic
          ? { ...sub, isVariadic: true }
          : sub;

        return {
          symbol: c,
          type: finalType,
          declaration: decl,
          genericArgs: args,
        };
      }

      const baseType = c.type as AST.FunctionTypeNode;
      const finalType = vc.isExplicitVariadic
        ? { ...baseType, isVariadic: true }
        : baseType;

      return {
        symbol: c,
        type: finalType,
        declaration: decl,
        genericArgs: undefined,
      };
    });

    // Categorize matches by specificity for better overload resolution
    const exactMatches: typeof substitutedCandidates = [];
    const wideningMatches: typeof substitutedCandidates = [];
    const compatibleMatches: typeof substitutedCandidates = [];

    for (const c of substitutedCandidates) {
      const ft = c.type;
      const decl = c.declaration as AST.FunctionDecl | AST.ExternDecl;
      let isExact = true;
      let needsWidening = false;
      let allCompatible = true;

      // Determine number of parameters to check
      let paramsToCheck = ft.paramTypes.length;
      let isBplVariadic = false;

      if (ft.isVariadic) {
        if (decl.kind === "FunctionDecl") {
          // BPL Variadic: (fixed..., variadic, count)
          // We check fixed params, then check remaining args against the element type of the variadic param
          isBplVariadic = true;
          paramsToCheck = ft.paramTypes.length - 2;
        }
      }

      for (let i = 0; i < argTypes.length; i++) {
        if (!argTypes[i]) {
          allCompatible = false;
          break;
        }

        let paramType: AST.TypeNode;

        if (isBplVariadic && i >= paramsToCheck) {
          // This is a variadic argument
          // The variadic param is at index paramsToCheck (length - 2)
          // It is a pointer to the element type (e.g. *int or *Any)
          const variadicArrayType = ft.paramTypes[paramsToCheck]!;

          // Extract element type
          if (variadicArrayType.kind === "BasicType") {
            if (variadicArrayType.pointerDepth > 0) {
              paramType = {
                ...variadicArrayType,
                pointerDepth: variadicArrayType.pointerDepth - 1,
              };
            } else if (variadicArrayType.arrayDimensions.length > 0) {
              paramType = {
                ...variadicArrayType,
                arrayDimensions: variadicArrayType.arrayDimensions.slice(1),
              };
            } else {
              // Should not happen if TypeChecker works correctly, but fallback
              paramType = variadicArrayType;
            }
          } else {
            paramType = variadicArrayType;
          }

          // Special case: Any accepts anything
          if (paramType.kind === "BasicType" && paramType.name === "Any") {
            continue; // Match!
          }
        } else if (i < paramsToCheck) {
          paramType = ft.paramTypes[i]!;
        } else {
          // Extern variadic or extra args for extern
          if (ft.isVariadic && decl.kind === "Extern") {
            continue; // Accept extra args for extern variadic
          }
          allCompatible = false;
          break;
        }

        const exactMatch = this.ctx.areTypesExactMatch(paramType, argTypes[i]!);
        if (exactMatch) {
          continue;
        }

        isExact = false;

        const widening = this.ctx.isImplicitWideningAllowed(
          argTypes[i]!,
          ft.paramTypes[i]!,
        );
        if (widening) {
          needsWidening = true;
          continue;
        }

        const compatible = this.ctx.areTypesCompatible(
          ft.paramTypes[i]!,
          argTypes[i]!,
        );
        if (!compatible) {
          allCompatible = false;
          break;
        }
      }

      if (!allCompatible) continue;

      if (isExact) {
        exactMatches.push(c);
      } else if (needsWidening) {
        wideningMatches.push(c);
      } else {
        compatibleMatches.push(c);
      }
    }

    // Prefer exact matches, then widening, then compatible
    const matched =
      exactMatches.length > 0
        ? exactMatches
        : wideningMatches.length > 0
          ? wideningMatches
          : compatibleMatches;

    if (matched.length > 1) {
      // Sort to prefer non-generic functions
      matched.sort((a, b) => {
        const aIsGeneric = !!a.genericArgs;
        const bIsGeneric = !!b.genericArgs;
        if (aIsGeneric === bIsGeneric) return 0;
        return aIsGeneric ? 1 : -1; // Non-generic first
      });
    }

    if (matched.length === 0) {
      throw new CompilerError(
        `No matching function for call to '${name}' with provided argument types.`,
        `Available overloads:\n${candidates.map((c) => this.ctx.typeToString(c.type!)).join("\n")}`,
        location,
      );
    }

    return matched[0]!;
  }

  /**
   * Find an operator overload method on a type
   * Returns the method declaration if found, otherwise undefined
   * Now supports generic types by substituting type parameters
   */
  findOperatorOverload(
    targetType: AST.TypeNode,
    methodName: string,
    paramTypes: AST.TypeNode[],
    resolveMemberWithContext: (
      objectType: AST.BasicTypeNode,
      memberName: string,
    ) =>
      | {
          decl: AST.StructDecl | AST.EnumDecl | AST.SpecDecl;
          members: (AST.StructField | AST.FunctionDecl | AST.SpecMethod)[];
          genericMap: Map<string, AST.TypeNode>;
        }
      | undefined,
  ): AST.FunctionDecl | undefined {
    // Only structs can have operator overloads
    if (targetType.kind !== "BasicType") return undefined;
    // Allow operator overloads on both values and pointers (e.g., Array<T> or *Array<T>)
    // The method signature will specify whether it expects pointer or value
    if (targetType.arrayDimensions.length > 0) return undefined;

    const basicType = targetType as AST.BasicTypeNode;

    // Find the struct or enum declaration
    let decl: AST.StructDecl | AST.EnumDecl | undefined;
    if (basicType.resolvedDeclaration) {
      if (
        basicType.resolvedDeclaration.kind === "StructDecl" ||
        basicType.resolvedDeclaration.kind === "EnumDecl"
      ) {
        decl = basicType.resolvedDeclaration as AST.StructDecl | AST.EnumDecl;
      }
    } else {
      // Look up by base name (works for both "Array" and "Array<T>")
      const baseName = basicType.name;
      const symbol = this.ctx.getCurrentScope().resolve(baseName);
      if (symbol) {
        if (
          symbol.kind === "Struct" &&
          (symbol.declaration as any).kind === "StructDecl"
        ) {
          decl = symbol.declaration as AST.StructDecl;
        } else if (
          symbol.kind === "Enum" &&
          (symbol.declaration as any).kind === "EnumDecl"
        ) {
          decl = symbol.declaration as AST.EnumDecl;
        }
      }
    }

    if (!decl) return undefined;

    // Build type substitution map for generic parameters
    const typeSubstitutionMap = new Map<string, AST.TypeNode>();
    if (basicType.genericArgs.length > 0 && decl.genericParams.length > 0) {
      if (basicType.genericArgs.length !== decl.genericParams.length) {
        // Generic argument count mismatch - should have been caught earlier
        return undefined;
      }

      for (let i = 0; i < decl.genericParams.length; i++) {
        typeSubstitutionMap.set(
          decl.genericParams[i]!.name,
          basicType.genericArgs[i]!,
        );
      }
    }

    // Look for the method (including in parent structs)
    const memberContext = resolveMemberWithContext(basicType, methodName);
    if (!memberContext) return undefined;

    const { members } = memberContext;
    const methods = members.filter((m) => m.kind === "FunctionDecl");

    if (methods.length === 0) return undefined;

    // Find matching overload by checking parameter types
    for (const method of methods) {
      const funcDecl = method as AST.FunctionDecl;

      // Skip static methods - operator overloads must be instance methods
      if (funcDecl.isStatic) continue;

      // Check that 'this' parameter type matches the target type
      if (funcDecl.params.length > 0) {
        const thisParam = funcDecl.params[0]!;
        const declaredThisType =
          typeSubstitutionMap.size > 0
            ? this.ctx.substituteType(thisParam.type, typeSubstitutionMap)
            : thisParam.type;

        const resolvedThisType = this.ctx.resolveType(declaredThisType);
        const resolvedTargetType = this.ctx.resolveType(targetType);

        // Check if 'this' type matches target type exactly
        const exactMatch = this.ctx.areTypesCompatible(
          resolvedThisType,
          resolvedTargetType,
        );

        // Also allow if 'this' is a pointer to target type
        let pointerMatch = false;
        if (
          declaredThisType.kind === "BasicType" &&
          targetType.kind === "BasicType"
        ) {
          const sameName = declaredThisType.name === targetType.name;
          const pointerDiff =
            declaredThisType.pointerDepth === targetType.pointerDepth + 1;
          const sameGenericCount =
            declaredThisType.genericArgs.length ===
            targetType.genericArgs.length;

          if (sameName && pointerDiff && sameGenericCount) {
            // Check generic args match
            let argsMatch = true;
            for (let i = 0; i < declaredThisType.genericArgs.length; i++) {
              const thisArg = this.ctx.resolveType(
                declaredThisType.genericArgs[i]!,
              );
              const targetArg = this.ctx.resolveType(
                targetType.genericArgs[i]!,
              );
              if (!this.ctx.areTypesCompatible(thisArg, targetArg)) {
                argsMatch = false;
                break;
              }
            }
            pointerMatch = argsMatch;
          }
        }

        if (!exactMatch && !pointerMatch) {
          continue; // Skip this overload, 'this' type doesn't match
        }
      }

      // Check parameter count (excluding 'this')
      const expectedParams = funcDecl.params.slice(1); // Skip 'this'
      if (expectedParams.length !== paramTypes.length) continue;

      // Check parameter types match with generic substitution
      let allMatch = true;
      for (let i = 0; i < paramTypes.length; i++) {
        const declaredParamType = expectedParams[i]!.type;

        // Substitute generic type parameters if present
        const expectedType =
          typeSubstitutionMap.size > 0
            ? this.ctx.substituteType(declaredParamType, typeSubstitutionMap)
            : declaredParamType;

        const resolvedExpected = this.ctx.resolveType(expectedType);
        const resolvedActual = this.ctx.resolveType(paramTypes[i]!);

        // Allow implicit address-of for operator parameters (T -> *T)
        const isAddressOfMatch =
          resolvedExpected.kind === "BasicType" &&
          resolvedActual.kind === "BasicType" &&
          resolvedExpected.pointerDepth === resolvedActual.pointerDepth + 1 &&
          this.ctx.areTypesCompatible(
            {
              ...resolvedExpected,
              pointerDepth: resolvedExpected.pointerDepth - 1,
            },
            resolvedActual,
          );

        if (
          !this.ctx.areTypesCompatible(resolvedExpected, resolvedActual) &&
          !isAddressOfMatch
        ) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return funcDecl;
      }
    }

    return undefined;
  }

  /**
   * Check if type is 'int'
   */
  private isIntType(type: AST.TypeNode): boolean {
    return (
      type.kind === "BasicType" &&
      type.name === "int" &&
      type.pointerDepth === 0 &&
      type.arrayDimensions.length === 0
    );
  }

  /**
   * Check if type is '*Any'
   */
  private isPointerToAny(type: AST.TypeNode): boolean {
    return (
      type.kind === "BasicType" &&
      type.name === "Any" &&
      type.pointerDepth === 1 &&
      type.arrayDimensions.length === 0
    );
  }
}
