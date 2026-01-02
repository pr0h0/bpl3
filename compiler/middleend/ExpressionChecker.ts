/**
 * ExpressionChecker - Handles type checking of expressions
 * These methods are designed to be bound to a TypeChecker instance using .call()
 */

import * as AST from "../common/AST";
import { CompilerError } from "../common/CompilerError";
import { typeCheckerLog } from "../common/Logger";
import { TokenType } from "../frontend/TokenType";
import { type Symbol, SymbolTable } from "./SymbolTable";
import { TypeUtils, KNOWN_TYPES } from "./TypeUtils";
import { OPERATOR_METHOD_MAP } from "./OverloadResolver";
import { CaptureAnalyzer } from "./CaptureAnalyzer";
import type { CheckerContext } from "./CheckerContext";

/**
 * Check a literal expression and return its type
 */
export function checkLiteral(
  this: CheckerContext,
  expr: AST.LiteralExpr,
): AST.TypeNode {
  let name = "void";
  if (expr.type === "number") {
    if (
      expr.raw.includes(".") ||
      expr.raw.includes("e") ||
      expr.raw.includes("E")
    ) {
      name = "float";
    } else {
      try {
        // Remove underscores which are allowed in BPL but not in JS BigInt constructor
        const cleanRaw = expr.raw.replace(/_/g, "");
        const val = BigInt(cleanRaw);
        const INT32_MIN = -2147483648n;
        const INT32_MAX = 2147483647n;
        if (val >= INT32_MIN && val <= INT32_MAX) {
          name = "int";
        } else {
          name = "long";
        }
      } catch (_e) {
        // Fallback or error if BigInt parsing fails (shouldn't happen with valid grammar, but good for fuzzing)
        throw new CompilerError(
          `Invalid integer literal: ${expr.raw}`,
          "Could not parse integer value.",
          expr.location,
        );
      }
    }
  } else if (expr.type === "string") {
    name = "string";
  } else if (expr.type === "bool") {
    name = "bool";
  } else if (expr.type === "char") {
    name = "char";
  } else if (expr.type === "nullptr") {
    name = "nullptr";
  } else if (expr.type === "null") {
    name = "null";
  }

  return {
    kind: "BasicType",
    name,
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: expr.location,
  };
}

/**
 * Check an interpolated string expression
 */
export function checkInterpolatedString(
  this: CheckerContext,
  expr: AST.InterpolatedStringExpr,
): AST.TypeNode {
  // Desugar to String concatenation: String.new("") + part1 + part2 ...

  // Initial: String.new("")
  let currentExpr: AST.Expression = {
    kind: "Call",
    callee: {
      kind: "Member",
      object: { kind: "Identifier", name: "String", location: expr.location },
      property: "new",
      location: expr.location,
    },
    args: [
      {
        kind: "Literal",
        value: "",
        raw: '""',
        type: "string",
        location: expr.location,
      },
    ],
    genericArgs: [],
    location: expr.location,
  };

  for (const part of expr.parts) {
    if (!part) {
      continue;
    }
    let rhs: AST.Expression;

    if (part.kind === "Literal" && part.type === "string") {
      rhs = part;
    } else {
      // Check if the expression is already a string
      // We need to check the type of the expression, but checkExpression might have side effects or report errors
      // if we call it multiple times. However, we need the type to decide how to wrap it.
      // The issue is that `checkExpression` is called inside the loop, and then again when checking `currentExpr`.
      // But `currentExpr` is constructed using `part` which is AST node.
      // If we modify `part` or wrap it, we should use the wrapped version.

      // Let's try to determine type without full check if possible, or just rely on checkExpression result.
      // The error "No compatible instance method 'toString' found on type '*i8'" suggests that
      // for `string` (which is `*i8`), it tries to call `.toString()` because `partType.name` check failed or something.

      // Wait, `string` type name is "string" (lowercase).
      // In BPL `string` is alias for `*char` (or `*i8`).

      const partType = this.checkExpression(part);

      // Check for "string" (primitive string)
      // Note: In BPL, 'string' is often an alias for '*char' or '*i8'
      // We need to check if it's a pointer to char/i8 or explicitly named "string"
      const isPrimitiveString =
        (partType &&
          partType.kind === "BasicType" &&
          partType.name === "string") ||
        (partType &&
          partType.kind === "BasicType" &&
          (partType.name === "char" || partType.name === "i8") &&
          partType.pointerDepth === 1);

      if (isPrimitiveString) {
        // It is a primitive string, wrap in String.new()
        rhs = {
          kind: "Call",
          callee: {
            kind: "Member",
            object: {
              kind: "Identifier",
              name: "String",
              location: part.location,
            },
            property: "new",
            location: part.location,
          },
          args: [part],
          genericArgs: [],
          location: part.location,
        };
      }
      // Check for "String" (std.String struct)
      else if (
        partType &&
        partType.kind === "BasicType" &&
        partType.name === "String"
      ) {
        rhs = part;
      }
      // Check for pointers (e.g. *int)
      else if (
        partType &&
        partType.kind === "BasicType" &&
        partType.pointerDepth > 0
      ) {
        // For pointers, we always print the address unless it's a primitive string (handled above).
        // We cast the pointer to 'long' and call String.fromAddress(long).

        rhs = {
          kind: "Call",
          callee: {
            kind: "Member",
            object: {
              kind: "Identifier",
              name: "String",
              location: part.location,
            },
            property: "fromAddress",
            location: part.location,
          },
          args: [
            {
              kind: "Cast",
              expression: part,
              targetType: {
                kind: "BasicType",
                name: "long",
                pointerDepth: 0,
                genericArgs: [],
                arrayDimensions: [],
                location: part.location,
              },
              location: part.location,
            },
          ],
          genericArgs: [],
          location: part.location,
        };
      }

      // Check for Array Literals or Arrays
      else if (
        partType &&
        partType.kind === "BasicType" &&
        partType.arrayDimensions.length > 0
      ) {
        // Arrays and pointers don't automatically have a toString method.
        // We check if one exists (e.g. for Array<T> struct), otherwise we disallow it.
        // Implementing generic array printing here would be complex.

        // Let's check for `toString` method.
        const hasToString =
          partType.kind === "BasicType" &&
          this.resolveMemberWithContext(partType, "toString");

        if (hasToString) {
          rhs = {
            kind: "Call",
            callee: {
              kind: "Member",
              object: part,
              property: "toString",
              location: part.location,
            },
            args: [],
            genericArgs: [],
            location: part.location,
          };
        } else {
          // No toString method found.
          // For arrays without toString, we will report an error.
          // This fulfills "rule it that it's not allowed".
          throw new CompilerError(
            `Array type '${this.typeToString(partType)}' cannot be interpolated directly. Please implement a 'toString' method or convert it to a string manually.`,
            "Array interpolation requires a 'toString' method.",
            part.location,
          );
        }
      }
      // Check for other types that might need toString()
      else {
        // Call .toString() on the expression
        rhs = {
          kind: "Call",
          callee: {
            kind: "Member",
            object: part,
            property: "toString",
            location: part.location,
          },
          args: [],
          genericArgs: [],
          location: part.location,
        };
      }
    }

    // currentExpr = currentExpr + rhs
    currentExpr = {
      kind: "Binary",
      left: currentExpr,
      operator: {
        type: TokenType.Plus,
        lexeme: "+",
        literal: "+",
        line: 0,
        column: 0,
        file: expr.location.file,
      },
      right: rhs,
      location: expr.location,
    };
  }

  expr.desugared = currentExpr;

  // Check the desugared expression
  // This will resolve types, operators, and ensure String is available
  const type = this.checkExpression(currentExpr);

  if (!type) {
    // Should not happen if String is available
    return {
      kind: "BasicType",
      name: "string",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: expr.location,
    };
  }

  return type;
}

/**
 * Check an identifier expression
 */
export function checkIdentifier(
  this: CheckerContext,
  expr: AST.IdentifierExpr,
): AST.TypeNode | undefined {
  const symbol = this.currentScope.resolve(expr.name);
  if (!symbol) {
    const similar = this.currentScope.findSimilar(expr.name);
    const hint = similar
      ? `Did you mean '${similar}'?`
      : "Ensure the variable or function is declared before use.";
    throw new CompilerError(
      `Undefined symbol '${expr.name}'`,
      hint,
      expr.location,
    );
  }

  if (symbol.declaration) {
    expr.resolvedDeclaration = symbol.declaration as any;
  }

  if (symbol.kind === "Module") {
    return {
      kind: "ModuleType",
      name: expr.name,
      moduleScope: symbol.moduleScope,
      location: expr.location,
    } as any;
  }
  if (symbol.kind === "Struct") {
    return {
      kind: "MetaType",
      type: {
        kind: "BasicType",
        name: expr.name,
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: expr.location,
      },
      location: expr.location,
    } as any;
  }
  if (symbol.kind === "Enum") {
    return {
      kind: "MetaType",
      type: {
        kind: "BasicType",
        name: expr.name,
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: expr.location,
      },
      location: expr.location,
    } as any;
  }

  if (symbol.type) {
    return this.resolveType(symbol.type, false);
  }

  typeCheckerLog.debug(`Symbol '${expr.name}' has no type!`, {
    kind: symbol.kind,
  });
  return symbol.type;
}

/**
 * Check a binary expression
 */
export function checkBinary(
  this: CheckerContext,
  expr: AST.BinaryExpr,
): AST.TypeNode | undefined {
  const leftType = this.checkExpression(expr.left);
  const rightType = this.checkExpression(expr.right);

  if (!leftType || !rightType) return undefined;

  const op = expr.operator.type;

  // Try operator overload first (for user-defined types)
  const methodName = OPERATOR_METHOD_MAP[expr.operator.lexeme];
  if (methodName) {
    let method = this.findOperatorOverload(leftType, methodName, [rightType]);
    let swapOperands = false;
    let negateResult = false;
    let targetType = leftType;

    // Synthesis logic for missing operators
    if (!method) {
      if (op === TokenType.BangEqual) {
        // != -> !(__eq__)
        method = this.findOperatorOverload(leftType, "__eq__", [rightType]);
        if (method) negateResult = true;
      } else if (op === TokenType.Greater) {
        // > -> < (swapped)
        method = this.findOperatorOverload(rightType, "__lt__", [leftType]);
        if (method) {
          swapOperands = true;
          targetType = rightType;
        }
      }
    }

    if (method) {
      // Build type substitution map for return type resolution (for generics)
      const typeSubstitutionMap = new Map<string, AST.TypeNode>();
      if (
        targetType.kind === "BasicType" &&
        targetType.genericArgs.length > 0
      ) {
        const decl = targetType.resolvedDeclaration;
        if (
          decl &&
          (decl.kind === "StructDecl" ||
            decl.kind === "EnumDecl" ||
            decl.kind === "SpecDecl" ||
            decl.kind === "TypeAlias") &&
          decl.genericParams &&
          decl.genericParams.length > 0
        ) {
          for (let i = 0; i < decl.genericParams.length; i++) {
            typeSubstitutionMap.set(
              decl.genericParams[i]!.name,
              targetType.genericArgs[i]!,
            );
          }
        }
      }

      // Found operator overload! Annotate the node
      expr.operatorOverload = {
        methodName: method.name,
        targetType,
        methodDeclaration: method,
        swapOperands,
        negateResult,
      };

      // Return the method's return type with generic substitution if needed
      return typeSubstitutionMap.size > 0
        ? this.substituteType(method.returnType, typeSubstitutionMap)
        : method.returnType;
    }
  }

  // Pointer arithmetic: pointer +/- integer
  if (
    leftType.kind === "BasicType" &&
    (leftType.pointerDepth > 0 || leftType.arrayDimensions.length > 0) &&
    (op === TokenType.Plus || op === TokenType.Minus)
  ) {
    if (rightType.kind === "BasicType" && TypeUtils.isIntegerType(rightType)) {
      // pointer + int = pointer
      return leftType;
    }
    // pointer - pointer = int (for same pointer type)
    if (
      op === TokenType.Minus &&
      rightType.kind === "BasicType" &&
      (rightType.pointerDepth > 0 || rightType.arrayDimensions.length > 0)
    ) {
      return {
        kind: "BasicType",
        name: "i64",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: expr.location,
      };
    }
  }

  // String concatenation
  if (
    leftType.kind === "BasicType" &&
    leftType.name === "string" &&
    rightType.kind === "BasicType" &&
    rightType.name === "string" &&
    op === TokenType.Plus
  ) {
    return leftType;
  }

  // Boolean operators
  if (op === TokenType.AndAnd || op === TokenType.OrOr) {
    const isBool = (t: AST.TypeNode) =>
      t.kind === "BasicType" && (t.name === "bool" || t.name === "i1");

    if (!isBool(leftType) || !isBool(rightType)) {
      throw new CompilerError(
        `Logical operators require boolean operands, got ${this.typeToString(
          leftType,
        )} and ${this.typeToString(rightType)}`,
        "Ensure both operands are boolean expressions.",
        expr.location,
      );
    }
    return leftType;
  }

  // Comparison operators
  if (TypeUtils.isComparisonOperator(op)) {
    // Allow comparison between compatible types
    if (!this.areTypesCompatible(leftType, rightType)) {
      throw new CompilerError(
        `Cannot compare ${this.typeToString(leftType)} and ${this.typeToString(rightType)}`,
        "Operands must be of compatible types.",
        expr.location,
      );
    }
    return {
      kind: "BasicType",
      name: "bool",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: expr.location,
    };
  }

  // Bitwise operators on integers
  if (
    [
      TokenType.Ampersand,
      TokenType.Pipe,
      TokenType.Caret,
      TokenType.LessLess,
      TokenType.GreaterGreater,
    ].includes(op)
  ) {
    if (
      !TypeUtils.isIntegerType(leftType) ||
      !TypeUtils.isIntegerType(rightType)
    ) {
      throw new CompilerError(
        `Bitwise operators require integer operands, got ${this.typeToString(
          leftType,
        )} and ${this.typeToString(rightType)}`,
        "Ensure both operands are integers.",
        expr.location,
      );
    }
    return leftType;
  }

  // Modulo operator
  if (op === TokenType.Percent) {
    if (
      !TypeUtils.isIntegerType(leftType) ||
      !TypeUtils.isIntegerType(rightType)
    ) {
      throw new CompilerError(
        `Modulo operator requires integer operands, got ${this.typeToString(
          leftType,
        )} and ${this.typeToString(rightType)}`,
        "Ensure both operands are integers.",
        expr.location,
      );
    }

    const rightVal = this.getIntegerConstantValue(expr.right);
    if (rightVal === 0n) {
      throw new CompilerError(
        "Division by zero",
        "The divisor in a modulo operation cannot be zero.",
        expr.right.location,
      );
    }
  }

  // Arithmetic operators
  if (!this.areTypesCompatible(leftType, rightType)) {
    throw new CompilerError(
      `Type mismatch: ${this.typeToString(leftType)} and ${this.typeToString(rightType)}`,
      "Ensure operands have compatible types.",
      expr.location,
    );
  }

  // Ensure arithmetic operators are only applied to numeric types (unless overloaded)
  if ([TokenType.Minus, TokenType.Star, TokenType.Slash].includes(op)) {
    if (
      !TypeUtils.isNumericType(leftType) ||
      !TypeUtils.isNumericType(rightType)
    ) {
      throw new CompilerError(
        `Operator '${expr.operator.lexeme}' cannot be applied to types '${this.typeToString(
          leftType,
        )}' and '${this.typeToString(rightType)}'`,
        "Arithmetic operators require numeric types.",
        expr.location,
      );
    }

    // Check for division by zero
    if (op === TokenType.Slash) {
      const rightVal = this.getIntegerConstantValue(expr.right);
      if (rightVal === 0n) {
        throw new CompilerError(
          "Division by zero",
          "The divisor in a division operation cannot be zero.",
          expr.right.location,
        );
      }
    }
  }

  return leftType;
}

/**
 * Check a unary expression
 */
export function checkUnary(
  this: CheckerContext,
  expr: AST.UnaryExpr,
): AST.TypeNode | undefined {
  const operandType = this.checkExpression(expr.operand);
  if (!operandType) return undefined;

  const op = expr.operator.type;

  // Try operator overload for user-defined types
  let lookupKey = expr.operator.lexeme;
  // Special handling for unary operators that share lexeme with binary operators or are defined with prefix in map
  if (["-", "+", "~"].includes(lookupKey)) {
    lookupKey = "unary" + lookupKey;
  }
  const methodName = OPERATOR_METHOD_MAP[lookupKey];
  if (methodName) {
    const method = this.findOperatorOverload(operandType, methodName, []);

    if (method) {
      // Build type substitution map for return type resolution (for generics)
      const typeSubstitutionMap = new Map<string, AST.TypeNode>();
      if (
        operandType.kind === "BasicType" &&
        operandType.genericArgs.length > 0
      ) {
        const decl = operandType.resolvedDeclaration;
        if (
          decl &&
          (decl.kind === "StructDecl" ||
            decl.kind === "EnumDecl" ||
            decl.kind === "SpecDecl" ||
            decl.kind === "TypeAlias") &&
          decl.genericParams &&
          decl.genericParams.length > 0
        ) {
          for (let i = 0; i < decl.genericParams.length; i++) {
            typeSubstitutionMap.set(
              decl.genericParams[i]!.name,
              operandType.genericArgs[i]!,
            );
          }
        }
      }

      // Found operator overload! Annotate the node
      expr.operatorOverload = {
        methodName,
        targetType: operandType,
        methodDeclaration: method,
      };

      return typeSubstitutionMap.size > 0
        ? this.substituteType(method.returnType, typeSubstitutionMap)
        : method.returnType;
    }
  }

  // Address-of operator (&)
  if (op === TokenType.Ampersand) {
    if (operandType.kind === "BasicType") {
      if (!operandType)
        typeCheckerLog.debug("operandType is undefined in Ampersand check");

      const result: AST.BasicTypeNode = {
        ...operandType,
        pointerDepth: operandType.pointerDepth + 1,
      };

      // Attach resolvedDeclaration if operand is a variable/parameter
      // This helps TypeGenerator reconstruct complex types like pointer-to-array
      if (expr.operand.kind === "Identifier") {
        const id = expr.operand as AST.IdentifierExpr;
        if (
          id.resolvedDeclaration &&
          (id.resolvedDeclaration.kind === "VariableDecl" ||
            id.resolvedDeclaration.kind === "Parameter")
        ) {
          result.variableDeclaration = id.resolvedDeclaration as
            | AST.VariableDecl
            | AST.Parameter;
        }
      }

      return result;
    }

    throw new CompilerError(
      `Cannot take address of ${this.typeToString(operandType)}`,
      "Address-of requires an lvalue.",
      expr.location,
    );
  }

  // Dereference operator (*)
  if (op === TokenType.Star) {
    if (operandType.kind === "BasicType") {
      if (operandType.pointerDepth > 0) {
        if (!operandType)
          typeCheckerLog.debug("operandType is undefined in Star check 1");
        return {
          ...operandType,
          pointerDepth: operandType.pointerDepth - 1,
        };
      }
      if (operandType.arrayDimensions.length > 0) {
        // Dereferencing array gives element type
        if (!operandType)
          typeCheckerLog.debug("operandType is undefined in Star check 2");
        return {
          ...operandType,
          arrayDimensions: operandType.arrayDimensions.slice(1),
        };
      }
    }

    throw new CompilerError(
      `Cannot dereference non-pointer type ${this.typeToString(operandType)}`,
      "Dereference requires a pointer type.",
      expr.location,
    );
  }

  // Logical not (!)
  if (op === TokenType.Bang) {
    if (!this.isBoolType(operandType)) {
      throw new CompilerError(
        `Logical not requires boolean operand, got ${this.typeToString(operandType)}`,
        "Ensure the operand is a boolean expression.",
        expr.location,
      );
    }
    return operandType;
  }

  // Bitwise not (~)
  if (op === TokenType.Tilde) {
    if (!TypeUtils.isIntegerType(operandType)) {
      throw new CompilerError(
        `Bitwise not requires integer operand, got ${this.typeToString(operandType)}`,
        "Ensure the operand is an integer.",
        expr.location,
      );
    }
    return operandType;
  }

  // Numeric negation (-)
  if (op === TokenType.Minus) {
    if (
      operandType.kind !== "BasicType" ||
      (!TypeUtils.isNumericType(operandType) &&
        operandType.name !== "float" &&
        operandType.name !== "double")
    ) {
      throw new CompilerError(
        `Unary operator '-' cannot be applied to type '${this.typeToString(
          operandType,
        )}'`,
        "Negation requires a numeric type.",
        expr.location,
      );
    }
    return operandType;
  }

  return operandType;
}

/**
 * Check an array literal expression
 */
export function checkArrayLiteral(
  this: CheckerContext,
  expr: AST.ArrayLiteralExpr,
): AST.TypeNode | undefined {
  if (expr.elements.length === 0) return undefined;

  const firstType = this.checkExpression(expr.elements[0]!);
  for (let i = 1; i < expr.elements.length; i++) {
    const elemType = this.checkExpression(expr.elements[i]!);
    if (
      firstType &&
      elemType &&
      !this.areTypesCompatible(firstType, elemType)
    ) {
      throw new CompilerError(
        `Array literal has inconsistent element types: ${this.typeToString(
          firstType,
        )} vs ${this.typeToString(elemType)}`,
        "All elements in an array literal must have the same type.",
        expr.elements[i]!.location,
      );
    }
  }

  if (firstType && firstType.kind === "BasicType") {
    return {
      ...firstType,
      arrayDimensions: [...firstType.arrayDimensions, expr.elements.length],
    };
  }
  return undefined;
}

/**
 * Check a struct literal expression
 */
export function checkStructLiteral(
  this: CheckerContext,
  expr: AST.StructLiteralExpr,
): AST.TypeNode | undefined {
  let symbol = this.currentScope.resolve(expr.structName);

  // Special handling for 'Any' struct used in variadics
  if (!symbol && expr.structName === "Any") {
    const modules = (this as any).modules;
    if (modules) {
      for (const scope of modules.values()) {
        const s = scope.resolve("Any");
        if (s && s.kind === "Struct") {
          symbol = s;
          break;
        }
      }
    }
  }

  if (!symbol || symbol.kind !== "Struct") {
    throw new CompilerError(
      `Unknown struct '${expr.structName}'`,
      "Ensure the struct is defined.",
      expr.location,
    );
  }

  const decl = symbol.declaration as AST.StructDecl;

  // Handle generics
  const genericMap = new Map<string, AST.TypeNode>();
  if (decl.genericParams.length > 0) {
    const providedArgs = expr.genericArgs || [];
    // If args are provided, check count
    if (providedArgs.length > 0) {
      if (providedArgs.length !== decl.genericParams.length) {
        throw new CompilerError(
          `Generic type '${expr.structName}' expects ${decl.genericParams.length} arguments, but got ${providedArgs.length}`,
          "Provide the correct number of generic arguments.",
          expr.location,
        );
      }
      for (let i = 0; i < decl.genericParams.length; i++) {
        genericMap.set(decl.genericParams[i]!.name, providedArgs[i]!);
      }
    }
  }

  // Check for missing fields
  const providedFields = new Set(expr.fields.map((f) => f.name));
  for (const member of decl.members) {
    if (member.kind === "StructField") {
      if (!providedFields.has(member.name)) {
        throw new CompilerError(
          `Missing field '${member.name}' in struct literal for '${expr.structName}'`,
          `Field '${member.name}' is required.`,
          expr.location,
        );
      }
    }
  }

  for (const field of expr.fields) {
    const memberResult = this.resolveStructField(decl, field.name);
    if (!memberResult) {
      throw new CompilerError(
        `Unknown field '${field.name}' in struct '${expr.structName}'`,
        "Check the struct definition for valid fields.",
        field.value.location,
      );
    }

    const { type: memberType } = memberResult;

    const valueType = this.checkExpression(field.value);
    if (valueType) {
      let resolvedMemberType = this.resolveType(memberType);
      if (genericMap.size > 0) {
        resolvedMemberType = this.substituteType(
          resolvedMemberType,
          genericMap,
        );
      }
      const resolvedValueType = this.resolveType(valueType);

      if (!this.areTypesCompatible(resolvedMemberType, resolvedValueType)) {
        throw new CompilerError(
          `Type mismatch for field '${field.name}': expected ${this.typeToString(
            memberType,
          )}, got ${this.typeToString(valueType)}`,
          "Field value must match the declared type.",
          field.value.location,
        );
      }
    }
  }

  return {
    kind: "BasicType",
    name: expr.structName,
    genericArgs: expr.genericArgs || [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: expr.location,
  };
}

/**
 * Check a tuple literal expression
 */
export function checkTupleLiteral(
  this: CheckerContext,
  expr: AST.TupleLiteralExpr,
): AST.TypeNode {
  const types: AST.TypeNode[] = [];

  for (const elem of expr.elements) {
    const elemType = this.checkExpression(elem);
    if (elemType) {
      types.push(elemType);
    } else {
      types.push(this.makeVoidType());
    }
  }

  return {
    kind: "TupleType",
    types,
    location: expr.location,
  };
}

/**
 * Check a ternary expression
 */
export function checkTernary(
  this: CheckerContext,
  expr: AST.TernaryExpr,
): AST.TypeNode | undefined {
  const condType = this.checkExpression(expr.condition);
  if (condType && !this.isBoolType(condType)) {
    throw new CompilerError(
      `Ternary condition must be boolean, got ${this.typeToString(condType)}`,
      "Ensure the condition evaluates to a boolean.",
      expr.condition.location,
    );
  }

  const thenType = this.checkExpression(expr.trueExpr);
  const elseType = this.checkExpression(expr.falseExpr);

  if (thenType && elseType && !this.areTypesCompatible(thenType, elseType)) {
    throw new CompilerError(
      `Ternary branches must have compatible types: ${this.typeToString(
        thenType,
      )} vs ${this.typeToString(elseType)}`,
      "Both branches must return the same type.",
      expr.location,
    );
  }

  return thenType;
}

/**
 * Check a cast expression
 */
export function checkCast(
  this: CheckerContext,
  expr: AST.CastExpr,
): AST.TypeNode {
  const exprType = this.checkExpression(expr.expression);

  if (exprType) {
    // Disallow casting integers to string
    if (
      expr.targetType.kind === "BasicType" &&
      expr.targetType.name === "string"
    ) {
      const resolvedSource = this.resolveType(exprType);
      // Check if source is integer and not a pointer
      if (
        resolvedSource.kind === "BasicType" &&
        resolvedSource.pointerDepth === 0 &&
        (this as any).isIntegerType(resolvedSource)
      ) {
        throw new CompilerError(
          `Cannot cast integer type '${this.typeToString(resolvedSource)}' to 'string'`,
          "Casting integers to string is not allowed. Use .toString() or similar conversion methods.",
          expr.location,
        );
      }
    }

    const resolved = this.resolveType(exprType);
    const target = this.resolveType(expr.targetType);

    // Check if cast is allowed using isCastAllowed from base
    if (!(this as any).isCastAllowed(resolved, target)) {
      throw new CompilerError(
        `Cannot cast ${this.typeToString(resolved)} to ${this.typeToString(target)}`,
        "This cast is not allowed.",
        expr.location,
      );
    }
  }

  return expr.targetType;
}

/**
 * Check a sizeof expression
 */
export function checkSizeof(
  this: CheckerContext,
  expr: AST.SizeofExpr,
): AST.TypeNode {
  let targetType: AST.TypeNode | undefined;
  const target = expr.target as AST.ASTNode;

  if (
    target.kind === "BasicType" ||
    target.kind === "TupleType" ||
    target.kind === "FunctionType" ||
    target.kind === "LambdaType" ||
    target.kind === "MetaType"
  ) {
    // Check if it's a BasicType that is actually a variable
    let isVariable = false;
    if (target.kind === "BasicType") {
      const basicTarget = target as AST.BasicTypeNode;
      const symbol = this.currentScope.resolve(basicTarget.name);
      if (
        symbol &&
        (symbol.kind === "Variable" || symbol.kind === "Parameter")
      ) {
        isVariable = true;
      }
    }

    if (isVariable && target.kind === "BasicType") {
      const basicTarget = target as AST.BasicTypeNode;
      // Treat as expression
      const idExpr: AST.IdentifierExpr = {
        kind: "Identifier",
        name: basicTarget.name,
        location: target.location,
      };
      expr.target = idExpr; // Update AST
      targetType = this.checkExpression(idExpr);
    } else {
      targetType = this.resolveType(target as AST.TypeNode);
    }
  } else {
    targetType = this.checkExpression(target as AST.Expression);
  }

  if (
    targetType &&
    targetType.kind === "BasicType" &&
    targetType.name === "void" &&
    targetType.pointerDepth === 0
  ) {
    throw new CompilerError(
      "Cannot take size of void",
      "Void type has no size.",
      expr.location,
    );
  }

  return {
    kind: "BasicType",
    name: "i64",
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: expr.location,
  };
}

/**
 * Check a type match expression (match<T>(value))
 */
export function checkTypeMatch(
  this: CheckerContext,
  expr: AST.TypeMatchExpr,
): AST.TypeNode {
  if ("kind" in expr.value && (expr.value.kind as string) !== "BasicType") {
    this.checkExpression(expr.value as AST.Expression);
  }

  const targetType = expr.targetType as AST.BasicTypeNode;
  const targetTypeName = targetType.name;

  // Check if this is an enum variant pattern
  if (targetTypeName.includes(".")) {
    const parts = targetTypeName.split(".");
    const variantName = parts.pop()!;
    const enumPath = parts;

    let currentScope = this.currentScope;
    let symbol: Symbol | undefined;

    for (let i = 0; i < enumPath.length; i++) {
      let part = enumPath[i]!;
      const genericMatch = part.match(/^([^<]+)/);
      if (genericMatch) {
        part = genericMatch[1]!;
      }

      symbol = currentScope.resolve(part);
      if (!symbol) break;

      if (i < enumPath.length - 1) {
        if (symbol.moduleScope) {
          currentScope = symbol.moduleScope;
        } else {
          symbol = undefined;
          break;
        }
      }
    }

    if (!symbol || symbol.kind !== "Enum") {
      throw new CompilerError(
        `Cannot find enum '${enumPath.join(".")}'`,
        `The type '${enumPath.join(".")}' in match<${targetTypeName}> is not a defined enum.`,
        expr.location,
      );
    }

    // Update targetType to use canonical enum name so codegen can find it
    (expr.targetType as AST.BasicTypeNode).name =
      `${symbol.name}.${variantName}`;
    (expr.targetType as AST.BasicTypeNode).resolvedDeclaration =
      symbol.declaration as AST.EnumDecl;
  } else {
    const isDefined =
      KNOWN_TYPES.includes(targetTypeName) ||
      this.currentScope.resolve(targetTypeName);

    if (!isDefined) {
      throw new CompilerError(
        `Unknown type '${targetTypeName}'`,
        `The type '${targetTypeName}' in match<${targetTypeName}> is not defined.`,
        expr.location,
      );
    }
  }

  return {
    kind: "BasicType",
    name: "bool",
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: expr.location,
  };
}

/**
 * Check an 'is' expression (expr is Type)
 */
export function checkIs(this: CheckerContext, expr: AST.IsExpr): AST.TypeNode {
  this.checkExpression(expr.expression);

  // If it's a BasicType, it might be an enum variant (e.g. Option.Some)
  if (expr.type.kind === "BasicType") {
    const targetType = expr.type as AST.BasicTypeNode;
    const targetTypeName = targetType.name;

    // Check if this is an enum variant pattern
    if (targetTypeName.includes(".")) {
      const parts = targetTypeName.split(".");
      const variantName = parts.pop()!;
      const enumPath = parts;

      let currentScope = this.currentScope;
      let symbol: Symbol | undefined;

      for (let i = 0; i < enumPath.length; i++) {
        let part = enumPath[i]!;
        const genericMatch = part.match(/^([^<]+)/);
        if (genericMatch) {
          part = genericMatch[1]!;
        }

        symbol = currentScope.resolve(part);
        if (!symbol) break;

        if (i < enumPath.length - 1) {
          if (symbol.moduleScope) {
            currentScope = symbol.moduleScope;
          } else {
            symbol = undefined;
            break;
          }
        }
      }

      if (!symbol || symbol.kind !== "Enum") {
        throw new CompilerError(
          `Cannot find enum '${enumPath.join(".")}'`,
          `The type '${enumPath.join(".")}' in 'is' expression is not a defined enum.`,
          expr.location,
        );
      }

      // Update targetType to use canonical enum name so codegen can find it
      (expr.type as AST.BasicTypeNode).name = `${symbol.name}.${variantName}`;
      (expr.type as AST.BasicTypeNode).resolvedDeclaration =
        symbol.declaration as AST.EnumDecl;
    } else {
      // Regular type check
      const resolved = this.resolveType(expr.type);
      if (
        resolved.kind === "BasicType" &&
        !KNOWN_TYPES.includes(resolved.name) &&
        !resolved.resolvedDeclaration
      ) {
        throw new CompilerError(
          `Unknown type: ${resolved.name}`,
          "Ensure the type is defined.",
          expr.location,
        );
      }
      expr.type = resolved;
    }
  } else {
    const resolved = this.resolveType(expr.type);
    if (
      resolved.kind === "BasicType" &&
      !KNOWN_TYPES.includes(resolved.name) &&
      !resolved.resolvedDeclaration
    ) {
      throw new CompilerError(
        `Unknown type: ${resolved.name}`,
        "Ensure the type is defined.",
        expr.location,
      );
    }
    expr.type = resolved;
  }

  return {
    kind: "BasicType",
    name: "bool",
    genericArgs: [],
    pointerDepth: 0,
    arrayDimensions: [],
    location: expr.location,
  };
}

/**
 * Check an 'as' expression (expr as Type)
 */
export function checkAs(this: CheckerContext, expr: AST.AsExpr): AST.TypeNode {
  const exprType = this.checkExpression(expr.expression);

  if (exprType) {
    // Disallow casting integers to string
    if (expr.type.kind === "BasicType" && expr.type.name === "string") {
      const resolvedSource = this.resolveType(exprType);
      // Check if source is integer and not a pointer
      if (
        resolvedSource.kind === "BasicType" &&
        resolvedSource.pointerDepth === 0 &&
        (this as any).isIntegerType(resolvedSource)
      ) {
        throw new CompilerError(
          `Cannot cast integer type '${this.typeToString(resolvedSource)}' to 'string'`,
          "Casting integers to string is not allowed. Use .toString() or similar conversion methods.",
          expr.location,
        );
      }
    }

    const resolved = this.resolveType(exprType);
    const target = this.resolveType(expr.type);

    // Check if cast is allowed using isCastAllowed from base
    if (!(this as any).isCastAllowed(resolved, target)) {
      throw new CompilerError(
        `Cannot cast ${this.typeToString(resolved)} to ${this.typeToString(target)}`,
        "This cast is not allowed.",
        expr.location,
      );
    }
  }

  return expr.type;
}

/**
 * Check a match expression
 */
export function checkMatchExpr(
  this: CheckerContext,
  expr: AST.MatchExpr,
): AST.TypeNode {
  const valueType = this.checkExpression(expr.value);
  if (!valueType) {
    throw new CompilerError(
      "Match value has no type",
      "Cannot match on values without a type.",
      expr.value.location,
    );
  }

  // We no longer restrict match to just BasicType (enums).
  // It can now match on Any, Generics, etc. via Type Matching.

  let enumDecl: AST.EnumDecl | undefined;

  // Try to resolve enum declaration if it's a BasicType
  if (valueType.kind === "BasicType") {
    if (valueType.resolvedDeclaration) {
      if (valueType.resolvedDeclaration.kind === "EnumDecl") {
        enumDecl = valueType.resolvedDeclaration as AST.EnumDecl;
      }
    } else {
      let symbol = this.currentScope.resolve(valueType.name);
      if (!symbol && valueType.name.includes(".")) {
        const parts = valueType.name.split(".");
        let current = this.currentScope.resolve(parts[0]!);
        for (let i = 1; i < parts.length; i++) {
          if (!current || !current.moduleScope) {
            current = undefined;
            break;
          }
          current = current.moduleScope.getInCurrentScope(parts[i]!);
        }
        symbol = current;
      }

      if (symbol && symbol.kind === "Enum") {
        enumDecl = symbol.declaration as AST.EnumDecl;
      }
    }
  }

  // If enumDecl is undefined, we treat it as a Type Match (or literal match)
  // checkPattern and checkMatchExhaustiveness handle undefined enumDecl now.

  let resultType: AST.TypeNode | undefined;
  for (const arm of expr.arms) {
    this.currentScope = this.currentScope.enterScope();

    this.checkPattern(arm.pattern, valueType, enumDecl);

    if (arm.guard) {
      const guardType = this.checkExpression(arm.guard);
      if (guardType && !this.isBoolType(guardType)) {
        throw new CompilerError(
          `Match guard must be a boolean expression, got ${this.typeToString(guardType)}`,
          "Guards must evaluate to bool.",
          arm.guard.location,
        );
      }
    }

    const armType = this.checkMatchArmBody(arm.body);

    this.currentScope = this.currentScope.exitScope();

    if (!resultType) {
      resultType = armType;
    } else if (armType && !this.areTypesCompatible(resultType, armType)) {
      throw new CompilerError(
        `Match arms must have compatible types: ${this.typeToString(
          resultType,
        )} vs ${this.typeToString(armType)}`,
        "All match arms must return the same type.",
        arm.location,
      );
    }
  }

  if (enumDecl) {
    this.checkMatchExhaustiveness(expr, enumDecl);
  }

  return resultType || this.makeVoidType();
}

/**
 * Check a lambda expression
 */
export function checkLambda(
  this: CheckerContext,
  expr: AST.LambdaExpr,
): AST.TypeNode {
  // 0. Infer types from context
  let expectedFuncType: AST.FunctionTypeNode | undefined;
  if (this.matchContext && this.matchContext.length > 0) {
    const ctx = this.matchContext[this.matchContext.length - 1]!;
    if (
      ctx.expectedType &&
      (ctx.expectedType.kind === "FunctionType" ||
        ctx.expectedType.kind === "LambdaType")
    ) {
      expectedFuncType = ctx.expectedType as AST.FunctionTypeNode;
    }
  }

  // 1. Create new scope
  const lambdaScope = new SymbolTable(this.currentScope);
  const previousScope = this.currentScope;
  this.currentScope = lambdaScope;

  // 2. Define parameters
  const paramTypes: AST.TypeNode[] = [];
  for (let i = 0; i < expr.params.length; i++) {
    const param = expr.params[i]!;
    let resolvedType: AST.TypeNode | undefined;

    if (param.type) {
      resolvedType = this.resolveType(param.type);
    } else if (expectedFuncType && i < expectedFuncType.paramTypes.length) {
      resolvedType = expectedFuncType.paramTypes[i];
    } else {
      throw new CompilerError(
        "Lambda parameter types must be explicit or inferred from context",
        "Mark all lambda parameters with explicit types or ensure context provides function type.",
        param.location,
      );
    }

    paramTypes.push(resolvedType!);

    // Define parameter in scope (skip if _)
    if (param.name !== "_") {
      const isConst = (resolvedType as any).isConst;
      this.currentScope.define({
        name: param.name,
        kind: "Parameter",
        type: resolvedType,
        declaration: param as any,
        isConst: isConst,
      });
    }
  }

  // 3. Check body
  const checker = this as any;
  const prevReturnType = checker.currentFunctionReturnType;
  const prevInDefer = checker.inDefer; // Save defer state - lambda has its own return semantics

  // Lambda body allows returns with values, even if we're inside a defer block
  checker.inDefer = false;

  if (expr.returnType) {
    checker.currentFunctionReturnType = this.resolveType(expr.returnType);
  } else if (expectedFuncType) {
    checker.currentFunctionReturnType = expectedFuncType.returnType;
  } else {
    // Default to void if not specified for now
    checker.currentFunctionReturnType = {
      kind: "BasicType",
      name: "void",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: expr.location,
    };
  }

  // Save and clear matchContext to prevent return statements from being captured by outer match/variable context
  const savedMatchContext = checker.matchContext;
  checker.matchContext = [];

  try {
    // Check the body
    this.checkBlock(expr.body, false); // false because we already created the scope
  } finally {
    checker.matchContext = savedMatchContext;
    checker.inDefer = prevInDefer; // Restore defer state
  }

  const returnType = checker.currentFunctionReturnType;

  // Restore scope and return type
  this.currentScope = previousScope;
  checker.currentFunctionReturnType = prevReturnType;

  // 4. Capture Analysis
  const analyzer = new CaptureAnalyzer(expr);
  const capturedVars = analyzer.analyze();
  expr.capturedVariables = capturedVars;

  // 5. Construct Function Type
  // Always return LambdaType for consistency.
  // This ensures all lambdas are treated as closures (fat pointers)
  // and avoids issues when mixing stateful and stateless lambdas.
  // Users needing raw function pointers (e.g. for FFI) should use named functions.
  return {
    kind: "LambdaType",
    returnType: returnType,
    paramTypes: paramTypes,
    location: expr.location,
    captures: capturedVars,
  };
}
