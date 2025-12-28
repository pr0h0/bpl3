/**
 * Call, Member, and Index expression checkers - extracted from TypeChecker
 */
import * as AST from "../common/AST";
import { CompilerError } from "../common/CompilerError";
import { TokenType } from "../frontend/TokenType";
import { TypeUtils } from "./TypeUtils";
import type { CheckerContext } from "./CheckerContext";

/**
 * Check a call expression
 */
export function checkCall(
  this: CheckerContext,
  expr: AST.CallExpr,
): AST.TypeNode | undefined {
  let name: string | undefined;
  let genericArgs: AST.TypeNode[] = expr.genericArgs || [];

  // Handle direct function calls or generic instantiation calls
  if (expr.callee.kind === "Identifier") {
    name = (expr.callee as AST.IdentifierExpr).name;
  } else if (expr.callee.kind === "GenericInstantiation") {
    const genExpr = expr.callee as AST.GenericInstantiationExpr;
    if (genExpr.base.kind === "Identifier") {
      name = (genExpr.base as AST.IdentifierExpr).name;
      if (genericArgs.length === 0) {
        genericArgs = genExpr.genericArgs;
      }
    }
  }

  if (name) {
    // Handle intrinsics
    if (name === "__type_id") {
      if (genericArgs.length !== 1) {
        throw new CompilerError(
          "Intrinsic __type_id requires exactly 1 generic argument",
          "",
          expr.location,
        );
      }
      if (expr.args.length !== 0) {
        throw new CompilerError(
          "Intrinsic __type_id accepts no arguments",
          "",
          expr.location,
        );
      }
      // Resolve the type to ensure it exists and is valid
      this.resolveType(genericArgs[0]!);

      // Return u64 type
      return {
        kind: "BasicType",
        name: "u64",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: expr.location,
      };
    }

    const symbol = this.currentScope.resolve(name);

    if (symbol && symbol.kind === "Function") {
      const candidates = [symbol, ...(symbol.overloads || [])];
      const argTypes = expr.args.map((arg) => this.checkExpression(arg));

      const match = this.resolveOverload(
        name,
        candidates,
        argTypes,
        genericArgs,
        expr.location,
      );

      expr.resolvedDeclaration = match.declaration as
        | AST.FunctionDecl
        | AST.ExternDecl;
      expr.callee.resolvedType = match.type;

      // Handle Variadic Argument Packing
      if (match.type.isVariadic && match.declaration.kind === "FunctionDecl") {
        packVariadicArguments.call(
          this,
          expr,
          match.declaration as AST.FunctionDecl,
          match.type,
        );
      }

      // Ensure base identifier in GenericInstantiation has resolvedType for CodeGenerator
      if (expr.callee.kind === "GenericInstantiation") {
        const genExpr = expr.callee as AST.GenericInstantiationExpr;
        if (genExpr.base.kind === "Identifier") {
          genExpr.base.resolvedType = match.type;
        }
      }

      if (match.genericArgs) {
        expr.genericArgs = match.genericArgs;
      }

      return (match.type as AST.FunctionTypeNode).returnType;
    }
  }

  const calleeType = this.checkExpression(expr.callee);
  const argTypes = expr.args.map((arg) => this.checkExpression(arg));

  // Handle enum variant constructor
  if (expr.callee.kind === "Member") {
    const memberExpr = expr.callee as AST.MemberExpr;
    const enumVariantInfo = (memberExpr as any).enumVariantInfo;

    if (enumVariantInfo) {
      return handleEnumVariantCall.call(
        this,
        expr,
        enumVariantInfo,
        argTypes,
        calleeType,
      );
    }
  }

  // Try __call__ operator overload
  if (
    calleeType &&
    calleeType.kind !== "FunctionType" &&
    calleeType.kind !== "LambdaType"
  ) {
    const method = this.findOperatorOverload(
      calleeType,
      "__call__",
      argTypes.filter((t): t is AST.TypeNode => t !== undefined),
    );

    if (method) {
      expr.operatorOverload = {
        methodName: "__call__",
        targetType: calleeType,
        methodDeclaration: method,
      };
      return this.resolveType(method.returnType);
    }

    throw new CompilerError(
      `Type '${this.typeToString(calleeType)}' is not callable`,
      "Only functions or types with __call__ operator can be called.",
      expr.location,
    );
  }

  if (
    calleeType &&
    (calleeType.kind === "FunctionType" || calleeType.kind === "LambdaType")
  ) {
    const funcType = calleeType as AST.FunctionTypeNode | AST.LambdaTypeNode;
    const overloads = (funcType as any).overloads as AST.FunctionTypeNode[];

    if (overloads && overloads.length > 0) {
      let bestMatch: AST.FunctionTypeNode | undefined;

      for (const candidate of overloads) {
        if (
          !candidate.isVariadic &&
          candidate.paramTypes.length !== argTypes.length
        )
          continue;

        let match = true;
        for (let i = 0; i < candidate.paramTypes.length; i++) {
          const paramType = candidate.paramTypes[i]!;
          const argType = argTypes[i];
          if (argType && !this.areTypesCompatible(paramType, argType)) {
            match = false;
            break;
          }
        }

        if (match) {
          bestMatch = candidate;
          break;
        }
      }

      if (bestMatch) {
        expr.callee.resolvedType = bestMatch;
        if (bestMatch.declaration) {
          expr.resolvedDeclaration = bestMatch.declaration as AST.FunctionDecl;
        }
        return validateFunctionCall.call(this, expr, bestMatch, argTypes);
      }
    }

    let effectiveFuncType = calleeType as AST.FunctionTypeNode;
    const decl = effectiveFuncType.declaration as AST.FunctionDecl;

    // Handle generic method inference
    if (decl && decl.genericParams && decl.genericParams.length > 0) {
      // Check if we have explicit generics in the call
      if (expr.genericArgs && expr.genericArgs.length > 0) {
        // Explicit generics provided - substitute them
        const typeMap = new Map<string, AST.TypeNode>();
        for (
          let i = 0;
          i < decl.genericParams.length && i < expr.genericArgs.length;
          i++
        ) {
          typeMap.set(decl.genericParams[i]!.name, expr.genericArgs[i]!);
        }
        effectiveFuncType = this.substituteType(
          effectiveFuncType,
          typeMap,
        ) as AST.FunctionTypeNode;
      } else {
        // Infer generics from arguments
        const typeMap = new Map<string, AST.TypeNode>();
        for (
          let i = 0;
          i < effectiveFuncType.paramTypes.length && i < argTypes.length;
          i++
        ) {
          const paramType = effectiveFuncType.paramTypes[i]!;
          const argType = argTypes[i];
          if (argType) {
            inferGenericArgs(paramType, argType, decl.genericParams, typeMap);
          }
        }

        if (typeMap.size > 0) {
          effectiveFuncType = this.substituteType(
            effectiveFuncType,
            typeMap,
          ) as AST.FunctionTypeNode;
          // Store inferred generics for code generation
          expr.genericArgs = decl.genericParams.map(
            (p) =>
              typeMap.get(p.name) ||
              ({
                kind: "BasicType",
                name: "void", // Default to void if not inferred?
                genericArgs: [],
                pointerDepth: 0,
                arrayDimensions: [],
                location: expr.location,
              } as AST.TypeNode),
          );
        }
      }
    }

    if (effectiveFuncType.declaration) {
      expr.resolvedDeclaration =
        effectiveFuncType.declaration as AST.FunctionDecl;
    }

    // Update resolvedType on callee to point to specialized type
    expr.callee.resolvedType = effectiveFuncType;

    // Handle Variadic Argument Packing (Explicit or Implicit)
    if (
      effectiveFuncType.declaration &&
      effectiveFuncType.declaration.kind === "FunctionDecl"
    ) {
      const decl = effectiveFuncType.declaration as AST.FunctionDecl;

      // Check if explicit variadic pattern
      let isExplicitVariadic = false;
      if (!effectiveFuncType.isVariadic) {
        const len = effectiveFuncType.paramTypes.length;
        if (len >= 2) {
          const lastParam = effectiveFuncType.paramTypes[len - 1]!;
          const secondLastParam = effectiveFuncType.paramTypes[len - 2]!;

          // Check types
          const isInt =
            lastParam.kind === "BasicType" &&
            (lastParam.name === "int" ||
              lastParam.name === "i32" ||
              lastParam.name === "i64") &&
            lastParam.pointerDepth === 0;
          const isPtrAny =
            secondLastParam.kind === "BasicType" &&
            secondLastParam.name === "Any" &&
            secondLastParam.pointerDepth === 1;

          if (isInt && isPtrAny && argTypes.length >= len - 2) {
            isExplicitVariadic = true;
          }
        }
      }

      if (effectiveFuncType.isVariadic || isExplicitVariadic) {
        // If explicit, we need to temporarily set isVariadic=true for packVariadicArguments to work
        const typeForPacking = isExplicitVariadic
          ? { ...effectiveFuncType, isVariadic: true }
          : effectiveFuncType;

        packVariadicArguments.call(this, expr, decl, typeForPacking);

        // Re-compute argTypes
        const newArgTypes = expr.args.map((arg) => this.checkExpression(arg));
        return validateFunctionCall.call(
          this,
          expr,
          typeForPacking,
          newArgTypes,
        );
      }
    }

    return validateFunctionCall.call(this, expr, effectiveFuncType, argTypes);
  }

  return undefined;
}

function handleEnumVariantCall(
  this: CheckerContext,
  expr: AST.CallExpr,
  enumVariantInfo: any,
  argTypes: (AST.TypeNode | undefined)[],
  calleeType: AST.TypeNode | undefined,
): AST.TypeNode | undefined {
  const variant = enumVariantInfo.variant as AST.EnumVariant;
  const typeMap = new Map<string, AST.TypeNode>();
  const enumDecl = enumVariantInfo.enumDecl as AST.EnumDecl;
  const genericArgs = enumVariantInfo.genericArgs || [];

  if (enumDecl.genericParams && genericArgs.length > 0) {
    for (
      let i = 0;
      i < enumDecl.genericParams.length && i < genericArgs.length;
      i++
    ) {
      typeMap.set(enumDecl.genericParams[i]!.name, genericArgs[i]!);
    }
  } else if (enumDecl.genericParams && genericArgs.length === 0) {
    // Try to infer generic arguments from arguments
    if (variant.dataType && variant.dataType.kind === "EnumVariantTuple") {
      const expectedTypes = variant.dataType.types;
      for (let i = 0; i < expectedTypes.length && i < argTypes.length; i++) {
        const paramType = expectedTypes[i]!;
        const argType = argTypes[i];
        if (!argType) continue;

        // Use recursive inference
        inferGenericArgs(paramType, argType, enumDecl.genericParams, typeMap);
      }
    }
  }

  if (variant.dataType) {
    if (variant.dataType.kind === "EnumVariantTuple") {
      const expectedTypes = variant.dataType.types;

      if (argTypes.length !== expectedTypes.length) {
        throw new CompilerError(
          `Enum variant '${variant.name}' expects ${expectedTypes.length} arguments, but got ${argTypes.length}`,
          `Usage: ${enumDecl.name}.${variant.name}(${expectedTypes
            .map((t: AST.TypeNode) => this.typeToString(t))
            .join(", ")})`,
          expr.location,
        );
      }

      for (let i = 0; i < expectedTypes.length; i++) {
        let expectedType = expectedTypes[i]!;
        if (typeMap.size > 0) {
          expectedType = this.substituteType(expectedType, typeMap);
        }
        expectedType = this.resolveType(expectedType);
        const actualType = argTypes[i];
        if (actualType && !this.areTypesCompatible(expectedType, actualType)) {
          throw new CompilerError(
            `Type mismatch for argument ${i + 1} of '${variant.name}': expected ${this.typeToString(
              expectedType,
            )}, got ${this.typeToString(actualType)}`,
            "Check the variant definition and argument types.",
            expr.location,
          );
        }
      }
    }
  } else if (argTypes.length > 0) {
    throw new CompilerError(
      `Unit variant '${variant.name}' does not take any arguments`,
      `Use: ${enumDecl.name}.${variant.name}`,
      expr.location,
    );
  }

  (expr as any).enumVariantInfo = enumVariantInfo;

  // Return specialized type if generics were inferred
  if (enumDecl.genericParams && typeMap.size > 0) {
    return {
      kind: "BasicType",
      name: enumDecl.name,
      genericArgs: enumDecl.genericParams.map(
        (p) =>
          typeMap.get(p.name) ||
          ({
            kind: "BasicType",
            name: p.name,
            location: expr.location,
          } as AST.TypeNode),
      ),
      pointerDepth: 0,
      arrayDimensions: [],
      location: expr.location,
    };
  }

  return calleeType;
}

function validateFunctionCall(
  this: CheckerContext,
  expr: AST.CallExpr,
  funcType: AST.FunctionTypeNode | AST.LambdaTypeNode,
  argTypes: (AST.TypeNode | undefined)[],
): AST.TypeNode {
  if (!funcType.isVariadic && funcType.paramTypes.length !== expr.args.length) {
    throw new CompilerError(
      `Expected ${funcType.paramTypes.length} arguments, got ${expr.args.length}`,
      "Argument count mismatch.",
      expr.location,
    );
  }

  for (let i = 0; i < funcType.paramTypes.length; i++) {
    const paramType = funcType.paramTypes[i]!;
    const argType = argTypes[i];
    if (argType && !this.areTypesCompatible(paramType, argType)) {
      throw new CompilerError(
        `Argument ${i + 1} type mismatch: expected ${this.typeToString(
          paramType,
        )}, got ${this.typeToString(argType)}`,
        "Ensure argument types match.",
        expr.args[i]!.location,
      );
    }
  }

  return funcType.returnType;
}

/**
 * Check a member access expression
 */
export function checkMember(
  this: CheckerContext,
  expr: AST.MemberExpr,
): AST.TypeNode | undefined {
  const objectType = this.checkExpression(expr.object);
  if (!objectType) return undefined;

  // Handle primitive member access - map to wrapper structs (Int, Bool, etc.)
  let effectiveObjectType = objectType;
  if (
    objectType.kind === "BasicType" &&
    objectType.pointerDepth === 0 &&
    objectType.arrayDimensions.length === 0
  ) {
    let structName: string | undefined;
    switch (objectType.name) {
      case "int":
      case "i32":
        structName = "Int";
        break;
      case "long":
      case "i64":
        structName = "Long";
        break;
      case "char":
      case "i8":
        structName = "Char";
        break;
      case "uchar":
      case "u8":
        structName = "UChar";
        break;
      case "short":
      case "i16":
        structName = "Short";
        break;
      case "ushort":
      case "u16":
        structName = "UShort";
        break;
      case "uint":
      case "u32":
        structName = "UInt";
        break;
      case "ulong":
      case "u64":
        structName = "ULong";
        break;
      case "bool":
      case "i1":
        structName = "Bool";
        break;
      case "double":
      case "f64":
        structName = "Double";
        break;
    }

    if (structName) {
      let symbol = this.currentScope.resolve(structName);
      if (!symbol) {
        const stdSymbol = this.currentScope.resolve("std");
        if (stdSymbol && stdSymbol.kind === "Module" && stdSymbol.moduleScope) {
          symbol = stdSymbol.moduleScope.resolve(structName);
        }
      }

      // Fallback: Try to find in any loaded module (e.g. primitives.bpl)
      // This allows primitive methods to work even if the wrapper struct isn't imported
      if (!symbol && (this as any).modules) {
        for (const moduleScope of (this as any).modules.values()) {
          const s = (moduleScope as any).resolve(structName);
          if (s && s.kind === "Struct") {
            symbol = s;
            break;
          }
        }
      }

      if (symbol && symbol.kind === "Struct") {
        effectiveObjectType = {
          kind: "BasicType",
          name: symbol.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: objectType.location,
          resolvedDeclaration: symbol.declaration as AST.StructDecl,
        };
      }
    }
  }

  // Handle module member access
  if ((effectiveObjectType as any).kind === "ModuleType") {
    const moduleScope = (effectiveObjectType as any).moduleScope;
    const symbol = moduleScope?.resolve(expr.property);
    if (!symbol) {
      throw new CompilerError(
        `Module has no exported member '${expr.property}'`,
        "Check the module's exports.",
        expr.location,
      );
    }

    if (symbol.kind === "Enum") {
      const enumDecl = symbol.declaration as AST.EnumDecl;
      return {
        kind: "MetaType",
        type: {
          kind: "BasicType",
          name: enumDecl.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: expr.location,
          resolvedDeclaration: enumDecl,
        },
        location: expr.location,
      } as any;
    }

    if (symbol.kind === "Module") {
      return {
        kind: "ModuleType",
        name: symbol.name,
        moduleScope: symbol.moduleScope,
        location: expr.location,
      } as any;
    }

    if (symbol.kind === "Struct") {
      return {
        kind: "MetaType",
        type: {
          kind: "BasicType",
          name: symbol.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: expr.location,
          resolvedDeclaration: symbol.declaration,
        },
        location: expr.location,
      } as any;
    }

    if (symbol.kind === "TypeAlias") {
      // Resolve the alias
      const aliasDecl = symbol.declaration as AST.TypeAliasDecl;
      const resolvedType = this.resolveType(aliasDecl.type);

      if (resolvedType.kind === "BasicType") {
        // If it aliases a struct, return MetaType for static access
        // We need to find the symbol for the resolved type name
        // It might be in the current scope or in the module scope where the alias is defined
        let structSymbol = this.currentScope.resolve(resolvedType.name);

        if (!structSymbol && symbol.moduleScope) {
          structSymbol = symbol.moduleScope.resolve(resolvedType.name);
        }

        // If still not found, try to resolve it via TypeUtils or global scope if possible
        // But resolvedType.name should be resolvable if the alias is valid.

        if (structSymbol && structSymbol.kind === "Struct") {
          return {
            kind: "MetaType",
            type: {
              ...resolvedType,
              resolvedDeclaration: structSymbol.declaration,
            },
            location: expr.location,
          } as any;
        }
      }
    }

    return symbol.type;
  }

  // Handle enum variant access
  if ((effectiveObjectType as any).kind === "MetaType") {
    const innerType = (effectiveObjectType as any).type as AST.BasicTypeNode;
    let symbol = this.currentScope.resolve(innerType.name);
    let decl = innerType.resolvedDeclaration;

    if (!decl && symbol) {
      decl = symbol.declaration as any;
    }

    if (decl && decl.kind === "EnumDecl") {
      const enumDecl = decl as AST.EnumDecl;
      const variant = enumDecl.variants.find((v) => v.name === expr.property);

      if (variant) {
        // Store variant info for code generation
        (expr as any).enumVariantInfo = {
          enumDecl,
          variant,
          variantIndex: enumDecl.variants.indexOf(variant),
          genericArgs: innerType.genericArgs,
        };

        // Return the enum type - variant construction returns enum type
        return {
          kind: "BasicType",
          name: innerType.name,
          genericArgs: innerType.genericArgs || [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: expr.location,
        };
      }
      // If not a variant, fall through to check for methods (handled below)
    }

    if (
      (symbol && symbol.kind === "Struct") ||
      (decl && decl.kind === "StructDecl") ||
      (decl && decl.kind === "EnumDecl")
    ) {
      const memberContext = this.resolveMemberWithContext(
        innerType,
        expr.property,
      );
      if (memberContext) {
        const { members, genericMap } = memberContext;
        const methods = members.filter(
          (m) => m.kind === "FunctionDecl",
        ) as AST.FunctionDecl[];

        if (methods.length > 0) {
          const candidates = methods.map((method) => {
            // Resolve types in module context first
            let { returnType, paramTypes } = resolveMethodTypesInModuleContext(
              this,
              method,
            );

            // Substitute generics if we have a map
            if (genericMap && genericMap.size > 0) {
              returnType = this.substituteType(returnType, genericMap);
              paramTypes = paramTypes.map((t) =>
                this.substituteType(t, genericMap),
              );
            }

            return {
              kind: "FunctionType",
              returnType: returnType,
              paramTypes: paramTypes,
              location: expr.location,
              declaration: method,
            } as AST.FunctionTypeNode;
          });

          if (candidates.length === 1) {
            return candidates[0];
          }

          const result = candidates[0]!;
          (result as any).overloads = candidates;
          return result;
        }

        throw new CompilerError(
          `No static member '${expr.property}' found on type '${innerType.name}'`,
          "Ensure the member is static (does not take 'this').",
          expr.location,
        );
      }
    }
  }

  // Handle struct/enum member access
  if (effectiveObjectType.kind === "BasicType") {
    const baseType =
      effectiveObjectType.pointerDepth > 0
        ? {
            ...effectiveObjectType,
            pointerDepth: effectiveObjectType.pointerDepth - 1,
          }
        : effectiveObjectType;

    // Check if it's an enum and look for methods - DELEGATE TO resolveMemberWithContext
    // const symbol = this.currentScope.resolve(baseType.name);
    // if (symbol && symbol.kind === "Enum") { ... } removed

    const memberContext = this.resolveMemberWithContext(
      baseType as AST.BasicTypeNode,
      expr.property,
    );
    if (memberContext) {
      const { members, genericMap } = memberContext;
      const member = members[0];

      if (member && member.kind === "StructField") {
        const fieldType = this.resolveType((member as AST.StructField).type);
        if (genericMap && genericMap.size > 0) {
          return this.substituteType(fieldType, genericMap);
        }
        return fieldType;
      }

      if (
        member &&
        (member.kind === "FunctionDecl" || member.kind === "SpecMethod")
      ) {
        const allMethods = members.filter(
          (m) => m.kind === "FunctionDecl" || m.kind === "SpecMethod",
        ) as (AST.FunctionDecl | AST.SpecMethod)[];

        // Filter out static methods and check 'this' compatibility
        const compatibleMethods: (AST.FunctionDecl | AST.SpecMethod)[] = [];
        for (const method of allMethods) {
          // Skip static methods (no 'this' parameter)
          if (method.kind === "FunctionDecl" && method.isStatic) continue;

          // Check if method has a 'this' parameter
          if (method.params.length > 0 && method.params[0]!.name === "this") {
            let thisParamType = method.params[0]!.type;

            // Substitute generics if needed
            if (genericMap && genericMap.size > 0) {
              thisParamType = this.substituteType(thisParamType, genericMap);
            }

            // Check compatibility of 'this' parameter type with object type
            const isThisCompatible = this.areTypesCompatible(
              thisParamType,
              effectiveObjectType,
            );

            // Also handle pointer compatibility (this: T* vs object: T)
            // We check if T is compatible with object type
            const pointerCompatible =
              thisParamType.kind === "BasicType" &&
              effectiveObjectType.kind === "BasicType" &&
              thisParamType.pointerDepth ===
                effectiveObjectType.pointerDepth + 1 &&
              this.areTypesCompatible(
                {
                  ...thisParamType,
                  pointerDepth: thisParamType.pointerDepth - 1,
                },
                effectiveObjectType,
              );

            // Also handle dereference compatibility (this: T vs object: T*)
            // We check if T is compatible with object type dereferenced
            const dereferenceCompatible =
              thisParamType.kind === "BasicType" &&
              effectiveObjectType.kind === "BasicType" &&
              thisParamType.pointerDepth ===
                effectiveObjectType.pointerDepth - 1 &&
              this.areTypesCompatible(thisParamType, {
                ...effectiveObjectType,
                pointerDepth: effectiveObjectType.pointerDepth - 1,
              });

            if (
              !isThisCompatible &&
              !pointerCompatible &&
              !dereferenceCompatible
            ) {
              continue; // Skip incompatible methods
            }
          } else {
            // Method has no 'this' parameter - this is a static method called on instance
            continue;
          }

          compatibleMethods.push(method);
        }

        if (compatibleMethods.length === 0) {
          throw new CompilerError(
            `No compatible instance method '${expr.property}' found on type '${this.typeToString(
              effectiveObjectType,
            )}'`,
            "Static methods must be called on the type, not an instance.",
            expr.location,
          );
        }

        if (compatibleMethods.length === 1 && compatibleMethods[0]) {
          const method = compatibleMethods[0];

          // Resolve types in module context first
          let { returnType, paramTypes: allParamTypes } =
            resolveMethodTypesInModuleContext(this, method);

          // Strip 'this' parameter
          let paramTypes = allParamTypes.slice(1);

          if (genericMap && genericMap.size > 0) {
            returnType = this.substituteType(returnType, genericMap);
            paramTypes = paramTypes.map((t) =>
              this.substituteType(t, genericMap),
            );
          }

          return {
            kind: "FunctionType",
            returnType: returnType,
            paramTypes,
            location: expr.location,
            declaration: method,
          } as AST.FunctionTypeNode;
        }

        // Multiple overloads
        if (compatibleMethods.length > 0 && compatibleMethods[0]) {
          const first = compatibleMethods[0];

          // Resolve types in module context first
          let { returnType: firstReturnType, paramTypes: allFirstParamTypes } =
            resolveMethodTypesInModuleContext(this, first);
          let firstParamTypes = allFirstParamTypes.slice(1);

          if (genericMap && genericMap.size > 0) {
            firstReturnType = this.substituteType(firstReturnType, genericMap);
            firstParamTypes = firstParamTypes.map((t) =>
              this.substituteType(t, genericMap),
            );
          }

          return {
            kind: "FunctionType",
            returnType: firstReturnType,
            paramTypes: firstParamTypes,
            location: expr.location,
            overloads: compatibleMethods.map((m) => {
              // Resolve types in module context first
              let { returnType: ret, paramTypes: allParams } =
                resolveMethodTypesInModuleContext(this, m);
              let params = allParams.slice(1);

              if (genericMap && genericMap.size > 0) {
                ret = this.substituteType(ret, genericMap);
                params = params.map((t) => this.substituteType(t, genericMap));
              }
              return {
                kind: "FunctionType" as const,
                returnType: ret,
                paramTypes: params,
                location: m.location,
                declaration: m,
              };
            }),
          } as any;
        }
      }
    }
  }

  // Handle tuple indexing
  if (effectiveObjectType.kind === "TupleType") {
    const index = parseInt(expr.property, 10);
    if (
      !isNaN(index) &&
      index >= 0 &&
      index < effectiveObjectType.types.length
    ) {
      return effectiveObjectType.types[index];
    }
    throw new CompilerError(
      `Invalid tuple index '${expr.property}'`,
      `Valid indices are 0-${effectiveObjectType.types.length - 1}`,
      expr.location,
    );
  }

  throw new CompilerError(
    `Cannot access member '${expr.property}' on type '${this.typeToString(effectiveObjectType)}'`,
    "Check the type definition for available members.",
    expr.location,
  );
}

/**
 * Check an index expression
 */
export function checkIndex(
  this: CheckerContext,
  expr: AST.IndexExpr,
): AST.TypeNode | undefined {
  const objectType = this.checkExpression(expr.object);
  const indexType = this.checkExpression(expr.index);

  if (!objectType) return undefined;

  // Handle array indexing
  if (
    objectType.kind === "BasicType" &&
    objectType.arrayDimensions &&
    objectType.arrayDimensions.length > 0
  ) {
    if (indexType && !TypeUtils.isIntegerType(indexType)) {
      throw new CompilerError(
        `Array index must be an integer, got ${this.typeToString(indexType)}`,
        "Ensure the index expression evaluates to an integer.",
        expr.index.location,
      );
    }
    const innerType = { ...objectType };
    innerType.arrayDimensions = innerType.arrayDimensions.slice(1);
    return innerType;
  }

  // Handle pointer indexing
  if (objectType.kind === "BasicType" && objectType.pointerDepth > 0) {
    if (indexType && !TypeUtils.isIntegerType(indexType)) {
      throw new CompilerError(
        `Pointer index must be an integer, got ${this.typeToString(indexType)}`,
        "Ensure the index expression evaluates to an integer.",
        expr.index.location,
      );
    }
    return {
      ...objectType,
      pointerDepth: objectType.pointerDepth - 1,
    };
  }

  // Try __get__ operator overload
  if (indexType) {
    const method = this.findOperatorOverload(objectType, "__get__", [
      indexType,
    ]);
    if (method) {
      expr.operatorOverload = {
        methodName: "__get__",
        targetType: objectType,
        methodDeclaration: method,
      };

      // Build type substitution map for return type resolution (for generics)
      const typeSubstitutionMap = new Map<string, AST.TypeNode>();
      if (
        objectType.kind === "BasicType" &&
        objectType.genericArgs.length > 0
      ) {
        const decl = objectType.resolvedDeclaration;
        if (decl && decl.genericParams && decl.genericParams.length > 0) {
          for (let i = 0; i < decl.genericParams.length; i++) {
            typeSubstitutionMap.set(
              decl.genericParams[i]!.name,
              objectType.genericArgs[i]!,
            );
          }
        }
      }

      return typeSubstitutionMap.size > 0
        ? this.substituteType(method.returnType, typeSubstitutionMap)
        : this.resolveType(method.returnType);
    }
  }

  throw new CompilerError(
    `Type '${this.typeToString(objectType)}' is not indexable`,
    "Only arrays, pointers, or types with __get__ operator can be indexed.",
    expr.location,
  );
}

function inferGenericArgs(
  paramType: AST.TypeNode,
  argType: AST.TypeNode,
  genericParams: AST.GenericParam[],
  typeMap: Map<string, AST.TypeNode>,
): void {
  if (paramType.kind === "BasicType") {
    // Direct match: paramType is T
    if (genericParams.some((p) => p.name === paramType.name)) {
      if (!typeMap.has(paramType.name)) {
        typeMap.set(paramType.name, argType);
      }
      return;
    }

    // Nested match: paramType is Option<T>, argType is Option<int>
    if (argType.kind === "BasicType" && paramType.name === argType.name) {
      // Check generic args
      for (
        let i = 0;
        i < paramType.genericArgs.length && i < argType.genericArgs.length;
        i++
      ) {
        inferGenericArgs(
          paramType.genericArgs[i]!,
          argType.genericArgs[i]!,
          genericParams,
          typeMap,
        );
      }
    }
  } else if (paramType.kind === "TupleType" && argType.kind === "TupleType") {
    for (
      let i = 0;
      i < paramType.types.length && i < argType.types.length;
      i++
    ) {
      inferGenericArgs(
        paramType.types[i]!,
        argType.types[i]!,
        genericParams,
        typeMap,
      );
    }
  } else if (
    paramType.kind === "FunctionType" &&
    argType.kind === "FunctionType"
  ) {
    // Return type
    inferGenericArgs(
      paramType.returnType,
      argType.returnType,
      genericParams,
      typeMap,
    );
    // Param types
    for (
      let i = 0;
      i < paramType.paramTypes.length && i < argType.paramTypes.length;
      i++
    ) {
      inferGenericArgs(
        paramType.paramTypes[i]!,
        argType.paramTypes[i]!,
        genericParams,
        typeMap,
      );
    }
  }
}

function resolveMethodTypesInModuleContext(
  context: CheckerContext,
  method: AST.FunctionDecl | AST.SpecMethod,
): { returnType: AST.TypeNode; paramTypes: AST.TypeNode[] } {
  let returnType = method.returnType || {
    kind: "BasicType",
    name: "void",
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: method.location,
  };
  let paramTypes = method.params.map((p) => p.type);

  if (method.location && (context as any).modules) {
    const modulePath = method.location.file;
    const moduleScope = (context as any).modules.get(modulePath);
    if (moduleScope) {
      const oldScope = (context as any).currentScope;
      (context as any).currentScope = moduleScope;
      try {
        returnType = context.resolveType(returnType);
        paramTypes = paramTypes.map((t) => context.resolveType(t));
      } finally {
        (context as any).currentScope = oldScope;
      }
    }
  }
  return { returnType, paramTypes };
}

function packVariadicArguments(
  this: CheckerContext,
  expr: AST.CallExpr,
  funcDecl: AST.FunctionDecl,
  funcType: AST.FunctionTypeNode,
): void {
  if (!funcType.isVariadic) return;
  if ((expr as any).variadicPacked) return;
  (expr as any).variadicPacked = true;

  const paramCount = funcDecl.params.length;
  // Expecting (..., variadic) - variadic is always last
  let fixedParamCount = paramCount - 1;

  // Special case for externs or functions where count is explicit in declaration
  if (paramCount > 0) {
    const lastParam = funcDecl.params[paramCount - 1];
    if (lastParam && !lastParam.isVariadic) {
      // Assume (..., variadic, count)
      fixedParamCount = paramCount - 2;
    }
  }

  if (fixedParamCount >= 0) {
    const variadicArgs = expr.args.slice(fixedParamCount);
    const fixedArgs = expr.args.slice(0, fixedParamCount);
    const variadicParam = funcDecl.params[fixedParamCount]!;

    let packedArgs: AST.Expression[] = variadicArgs;

    // Check if Heterogeneous (Any)
    const isVariadicAny =
      variadicParam.type.kind === "BasicType" &&
      variadicParam.type.name === "Any" &&
      variadicParam.isVariadic;

    const isExplicitAnyPtr =
      variadicParam.type.kind === "BasicType" &&
      variadicParam.type.name === "Any" &&
      variadicParam.type.pointerDepth === 1;

    if (isVariadicAny || isExplicitAnyPtr) {
      packedArgs = variadicArgs.map((arg) => {
        // Create Any struct literal
        // Any { type_id: __type_id<T>(), data: cast<u64>(arg) }
        const u64Type: AST.BasicTypeNode = {
          kind: "BasicType",
          name: "u64",
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: arg.location,
        };

        const typeIdCall: AST.CallExpr = {
          kind: "Call",
          callee: {
            kind: "Identifier",
            name: "__type_id",
            location: arg.location,
          },
          args: [],
          genericArgs: [arg.resolvedType!],
          location: arg.location,
          resolvedType: u64Type,
        };

        const castExpr: AST.CastExpr = {
          kind: "Cast",
          targetType: u64Type,
          expression: arg,
          location: arg.location,
          resolvedType: u64Type,
        };

        const anyType: AST.BasicTypeNode = {
          kind: "BasicType",
          name: "Any",
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: arg.location,
        };

        return {
          kind: "StructLiteral",
          structName: "Any",
          fields: [
            {
              name: "type_id",
              value: typeIdCall,
            },
            {
              name: "data",
              value: castExpr,
            },
          ],
          genericArgs: [],
          location: arg.location,
          resolvedType: anyType,
        } as AST.StructLiteralExpr;
      });
    }

    const arrayLiteral: AST.ArrayLiteralExpr = {
      kind: "ArrayLiteral",
      elements: packedArgs,
      location: expr.location,
      resolvedType: {
        kind: "BasicType",
        name: (variadicParam.type as AST.BasicTypeNode).name,
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [variadicArgs.length],
        location: expr.location,
      },
    };

    let argsPtrExpr: AST.Expression;

    // Determine the element type for the pointer
    // If it's Any, we use Any. If it's T, we use T.
    // variadicParam.type is the element type (e.g. int or Any)
    const elementType = variadicParam.type;
    const pointerType: AST.TypeNode = {
      ...elementType,
      pointerDepth: (elementType as AST.BasicTypeNode).pointerDepth + 1,
    } as AST.TypeNode;

    if (packedArgs.length === 0) {
      // Cast 0 to *T
      argsPtrExpr = {
        kind: "Cast",
        targetType: pointerType,
        expression: {
          kind: "Literal",
          value: 0n,
          raw: "0",
          type: "number",
          location: expr.location,
          resolvedType: {
            kind: "BasicType",
            name: "int",
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: expr.location,
          },
        },
        location: expr.location,
        resolvedType: pointerType,
      };
    } else {
      // &array[0]
      const indexExpr: AST.IndexExpr = {
        kind: "Index",
        object: arrayLiteral,
        index: {
          kind: "Literal",
          value: 0n,
          raw: "0",
          type: "number",
          location: expr.location,
          resolvedType: {
            kind: "BasicType",
            name: "int",
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: expr.location,
          },
        },
        location: expr.location,
        resolvedType: elementType,
      };

      argsPtrExpr = {
        kind: "Unary",
        operator: {
          type: TokenType.Ampersand,
          lexeme: "&",
          literal: "&",
          line: 0,
          column: 0,
          file: "internal",
        },
        operand: indexExpr,
        isPrefix: true,
        location: expr.location,
        resolvedType: pointerType,
      };
    }

    // Count literal
    const countLiteral: AST.LiteralExpr = {
      kind: "Literal",
      value: BigInt(variadicArgs.length),
      raw: variadicArgs.length.toString(),
      type: "number",
      location: expr.location,
      resolvedType: {
        kind: "BasicType",
        name: "int",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: expr.location,
      },
    };

    expr.args = [...fixedArgs, argsPtrExpr, countLiteral];
    expr.variadicPacked = true;
  }
}
