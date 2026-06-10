/**
 * StatementChecker - Handles type checking of statements
 * These methods are designed to be bound to a TypeChecker instance using .call()
 */

import * as AST from "../common/AST";
import { CompilerError, DiagnosticSeverity } from "../common/CompilerError";
import { INTEGER_TYPES } from "./TypeUtils";
import type { CheckerContext } from "./CheckerContext";
import type { Symbol } from "./SymbolTable";
import {
  BREAK_OUTSIDE_CONTEXT_CODE,
  CONDITION_TYPE_MISMATCH_CODE,
  CONTINUE_OUTSIDE_LOOP_CODE,
  DEFER_RETURN_VALUE_INVALID_CODE,
  FALLTHROUGH_OUTSIDE_SWITCH_CODE,
  INTEGER_LITERAL_OVERFLOW_CODE,
  RETURN_TYPE_MISMATCH_CODE,
  SWITCH_CASE_TYPE_MISMATCH_CODE,
  SWITCH_VALUE_TYPE_MISMATCH_CODE,
  TUPLE_DESTRUCTURE_TARGET_INVALID_CODE,
  VARIABLE_REDECLARATION_CODE,
  VARIABLE_TYPE_ANNOTATION_MISSING_CODE,
  VOID_TYPE_INVALID_CODE,
} from "./TypeCheckerBase";

function isUnsafeStackAddressSymbol(symbol: Symbol | undefined): boolean {
  if (!symbol || (symbol.kind !== "Variable" && symbol.kind !== "Parameter")) {
    return false;
  }

  if (symbol.kind === "Parameter") {
    return true;
  }

  const decl = symbol.declaration as AST.VariableDecl;
  return !decl.isGlobal && !decl.isConst;
}

function findReturnedStackAddress(
  context: CheckerContext,
  expr: AST.Expression | undefined,
): string | undefined {
  if (!expr) return undefined;

  if (expr.kind === "Unary" && expr.operator.type === "Ampersand") {
    const operand = expr.operand;
    if (operand.kind === "Identifier") {
      const symbol = context.currentScope.resolve(operand.name);
      if (
        isUnsafeStackAddressSymbol(symbol) &&
        !operand.name.startsWith("_")
      ) {
        return operand.name;
      }
    }
  }

  switch (expr.kind) {
    case "StructLiteral":
      for (const field of (expr as AST.StructLiteralExpr).fields) {
        const name = findReturnedStackAddress(context, field.value);
        if (name) return name;
      }
      break;
    case "TupleLiteral":
      for (const element of (expr as AST.TupleLiteralExpr).elements) {
        const name = findReturnedStackAddress(context, element);
        if (name) return name;
      }
      break;
    case "ArrayLiteral":
      for (const element of (expr as AST.ArrayLiteralExpr).elements) {
        const name = findReturnedStackAddress(context, element);
        if (name) return name;
      }
      break;
    case "EnumStructVariant":
      for (const field of (expr as AST.EnumStructVariantExpr).fields) {
        const name = findReturnedStackAddress(context, field.value);
        if (name) return name;
      }
      break;
    case "Cast":
      return findReturnedStackAddress(context, (expr as AST.CastExpr).expression);
    case "Group":
      return findReturnedStackAddress(context, (expr as AST.GroupExpr).expression);
    case "Ternary": {
      const ternary = expr as AST.TernaryExpr;
      return (
        findReturnedStackAddress(context, ternary.trueExpr) ||
        findReturnedStackAddress(context, ternary.falseExpr)
      );
    }
  }

  return undefined;
}

function getShadowedValueKind(symbol: Symbol): "parameter" | "variable" {
  return symbol.kind === "Parameter" || symbol.declaration.kind === "Parameter"
    ? "parameter"
    : "variable";
}

type BranchNarrowing = {
  name: string;
  type: AST.TypeNode;
  declaration: AST.ASTNode;
  isConst?: boolean;
};

function unwrapCondition(condition: AST.Expression): AST.Expression {
  if (condition.kind === "Group") {
    return unwrapCondition((condition as AST.GroupExpr).expression);
  }
  return condition;
}

function isObjectNarrowingTarget(type: AST.TypeNode): boolean {
  if (type.kind !== "BasicType" || !type.resolvedDeclaration) {
    return false;
  }

  return (
    type.resolvedDeclaration.kind === "StructDecl" ||
    type.resolvedDeclaration.kind === "SpecDecl"
  );
}

function isAnyRuntimeContainer(type: AST.TypeNode): boolean {
  return type.kind === "BasicType" && type.name === "Any";
}

function getNarrowingForIdentifier(
  context: CheckerContext,
  identifier: AST.IdentifierExpr,
  targetType: AST.TypeNode,
): BranchNarrowing | undefined {
  const original = context.currentScope.resolve(identifier.name);
  if (!original || !original.type) return undefined;

  const originalType = context.resolveType(original.type);
  const resolvedTarget = context.resolveType(targetType);
  let narrowedType = resolvedTarget;

  if (isAnyRuntimeContainer(originalType)) {
    return undefined;
  }

  if (!isObjectNarrowingTarget(resolvedTarget)) {
    return undefined;
  }

  if (
    originalType.kind === "BasicType" &&
    resolvedTarget.kind === "BasicType" &&
    originalType.pointerDepth > 0 &&
    resolvedTarget.pointerDepth === 0
  ) {
    narrowedType = {
      ...resolvedTarget,
      pointerDepth: originalType.pointerDepth,
    };
  }

  if (!context.isCastAllowed(originalType, narrowedType)) {
    return undefined;
  }

  return {
    name: identifier.name,
    type: narrowedType,
    declaration: original.declaration,
    isConst: original.isConst,
  };
}

function getTypeGuardNarrowing(
  context: CheckerContext,
  condition: AST.Expression,
): BranchNarrowing | undefined {
  const unwrapped = unwrapCondition(condition);

  if (unwrapped.kind === "Is") {
    const isExpr = unwrapped as AST.IsExpr;
    if (isExpr.expression.kind !== "Identifier") return undefined;
    return getNarrowingForIdentifier(
      context,
      isExpr.expression as AST.IdentifierExpr,
      isExpr.type,
    );
  }

  if (unwrapped.kind === "TypeMatch") {
    const matchExpr = unwrapped as AST.TypeMatchExpr;
    if (
      !("kind" in matchExpr.value) ||
      (matchExpr.value as AST.ASTNode).kind !== "Identifier"
    ) {
      return undefined;
    }
    return getNarrowingForIdentifier(
      context,
      matchExpr.value as AST.IdentifierExpr,
      matchExpr.targetType,
    );
  }

  return undefined;
}

function checkThenBranchWithNarrowing(
  context: CheckerContext,
  branch: AST.Statement,
  narrowing: BranchNarrowing | undefined,
): void {
  context.currentScope = context.currentScope.enterScope();
  if (narrowing) {
    context.defineSymbol(
      narrowing.name,
      "Variable",
      narrowing.type,
      narrowing.declaration,
      undefined,
      narrowing.isConst,
    );
  }

  if (branch.kind === "Block") {
    checkBlock.call(context, branch as AST.BlockStmt, true);
  } else {
    context.checkStatement(branch);
  }

  context.currentScope = context.currentScope.exitScope();
}

/**
 * Check a block statement
 */
export function checkBlock(
  this: CheckerContext,
  stmt: AST.BlockStmt,
  newScope: boolean = true,
): void {
  if (newScope) {
    this.currentScope = this.currentScope.enterScope();
  }

  let terminated = false;
  for (const s of stmt.statements) {
    if (terminated) {
      const error = new CompilerError(
        "Unreachable code detected.",
        "This statement follows a return, break, continue, or throw statement and will never be executed.",
        s.location,
      ).setSeverity(DiagnosticSeverity.Warning);
      if (this.collectAllErrors) {
        this.errors.push(error);
      } else {
        throw error;
      }
    }

    try {
      this.checkStatement(s);
    } catch (e) {
      if (this.collectAllErrors && e instanceof CompilerError) {
        this.errors.push(e);
        continue;
      }
      throw e;
    }

    if (
      s.kind === "Return" ||
      s.kind === "Break" ||
      s.kind === "Continue" ||
      s.kind === "Throw" ||
      s.kind === "Fallthrough"
    ) {
      terminated = true;
    }
  }

  if (newScope) {
    const unused = this.currentScope.getUnusedVariables();
    for (const symbol of unused) {
      if (symbol.name.startsWith("_")) continue;
      const error = new CompilerError(
        `Unused variable '${symbol.name}'`,
        "Variable is declared but never used.",
        symbol.declaration.location,
      );
      if (this.collectAllErrors) {
        this.errors.push(error);
      } else {
        throw error;
      }
    }
    this.currentScope = this.currentScope.exitScope();
  }
}

/**
 * Check an if statement
 */
export function checkIf(this: CheckerContext, stmt: AST.IfStmt): void {
  const condType = this.checkExpression(stmt.condition);
  if (condType && !this.isBoolType(condType)) {
    throw new CompilerError(
      `If condition must be boolean, got ${this.typeToString(condType)}`,
      "Ensure the condition evaluates to a boolean.",
      stmt.condition.location,
      CONDITION_TYPE_MISMATCH_CODE,
    );
  }

  const narrowing = getTypeGuardNarrowing(this, stmt.condition);

  // Check then branch
  if (stmt.thenBranch) {
    checkThenBranchWithNarrowing(this, stmt.thenBranch, narrowing);
  }

  // Check else branch
  if (stmt.elseBranch) {
    if (stmt.elseBranch.kind === "Block") {
      checkBlock.call(this, stmt.elseBranch as AST.BlockStmt, true);
    } else if (stmt.elseBranch.kind === "If") {
      // Else if - no new scope needed for the 'if' itself as it handles its own scopes
      this.checkStatement(stmt.elseBranch);
    } else {
      this.currentScope = this.currentScope.enterScope();
      this.checkStatement(stmt.elseBranch);
      this.currentScope = this.currentScope.exitScope();
    }
  }
}

/**
 * Check a loop statement (for/while)
 */
export function checkLoop(this: CheckerContext, stmt: AST.LoopStmt): void {
  this.loopDepth++;

  // Enter loop scope for init variable
  this.currentScope = this.currentScope.enterScope();

  if (stmt.init) {
    this.checkStatement(stmt.init);
  }

  if (stmt.condition) {
    const condType = this.checkExpression(stmt.condition);
    if (condType && !this.isBoolType(condType)) {
      throw new CompilerError(
        `Loop condition must be boolean, got ${this.typeToString(condType)}`,
        "Ensure the condition evaluates to a boolean.",
        stmt.condition.location,
        CONDITION_TYPE_MISMATCH_CODE,
      );
    }
  }

  if (stmt.step) {
    this.checkExpression(stmt.step);
  }

  if (stmt.body) {
    if (stmt.body.kind === "Block") {
      checkBlock.call(this, stmt.body as AST.BlockStmt, true);
    } else {
      this.currentScope = this.currentScope.enterScope();
      this.checkStatement(stmt.body);

      // Check for unused variables in the loop body scope
      const unused = this.currentScope.getUnusedVariables();
      for (const symbol of unused) {
        if (symbol.name.startsWith("_")) continue;
        const error = new CompilerError(
          `Unused variable '${symbol.name}'`,
          "Variable is declared but never used.",
          symbol.declaration.location,
        );
        if (this.collectAllErrors) {
          this.errors.push(error);
        } else {
          throw error;
        }
      }
      this.currentScope = this.currentScope.exitScope();
    }
  }

  // Check for unused variables in the loop scope (init vars)
  const unused = this.currentScope.getUnusedVariables();
  for (const symbol of unused) {
    if (symbol.name.startsWith("_")) continue;
    const error = new CompilerError(
      `Unused variable '${symbol.name}'`,
      "Variable is declared but never used.",
      symbol.declaration.location,
    );
    if (this.collectAllErrors) {
      this.errors.push(error);
    } else {
      throw error;
    }
  }

  this.currentScope = this.currentScope.exitScope();
  this.loopDepth--;
}

/**
 * Check a return statement
 */
export function checkReturn(this: CheckerContext, stmt: AST.ReturnStmt): void {
  if (this.inDefer) {
    if (stmt.value) {
      throw new CompilerError(
        "Return with value not allowed in defer block",
        "Defer blocks must return void. Use 'return;' to exit the defer block early.",
        stmt.location,
        DEFER_RETURN_VALUE_INVALID_CODE,
      );
    }
    return;
  }

  const returnType = stmt.value
    ? this.checkExpression(stmt.value)
    : this.makeVoidType();

  if (stmt.value && !returnType) {
    return;
  }

  // Check if we are in a match arm block
  // We need to access the TypeChecker instance which has matchContext
  // Since 'this' is StatementCheckerContext, we might need to cast or add it to context
  const typeChecker = this as any;
  if (typeChecker.matchContext && typeChecker.matchContext.length > 0) {
    const context =
      typeChecker.matchContext[typeChecker.matchContext.length - 1];
    if (returnType) {
      context.inferredTypes.push(returnType);
    }
    return;
  }

  if (this.currentFunctionReturnType) {
    const resolvedExpected = this.resolveType(this.currentFunctionReturnType);
    const resolvedActual = returnType
      ? this.resolveType(returnType)
      : this.makeVoidType();

    // Allow integer constant to match any compatible integer type
    if (stmt.value && returnType && returnType.kind === "BasicType") {
      const constVal = this.getIntegerConstantValue(stmt.value);
      if (
        constVal !== undefined &&
        this.isIntegerTypeCompatible(constVal, resolvedExpected)
      ) {
        // Annotate the literal with the target type for code generation
        if (stmt.value.kind === "Literal" || stmt.value.kind === "Unary") {
          stmt.value.resolvedType = resolvedExpected;
        }
        return; // Types are compatible
      }
    }

    if (!this.areTypesCompatible(resolvedExpected, resolvedActual)) {
      throw new CompilerError(
        `Return type mismatch: expected ${this.typeToString(
          resolvedExpected,
        )}, got ${this.typeToString(resolvedActual)}`,
        "Ensure the returned value matches the function's return type.",
        stmt.location,
        RETURN_TYPE_MISMATCH_CODE,
      );
    }

    // Safety check: BUG-106/BUG-143 Prevent returning stack addresses directly
    // or hidden inside aggregate literals.
    let stackAddressName: string | undefined;
    switch (stmt.value?.kind) {
      case "Unary":
        if (stmt.value.operator.type === "Ampersand") {
          stackAddressName = findReturnedStackAddress(this, stmt.value);
        }
        break;
      case "StructLiteral":
      case "TupleLiteral":
      case "ArrayLiteral":
      case "EnumStructVariant":
      case "Cast":
      case "Group":
      case "Ternary":
        stackAddressName = findReturnedStackAddress(this, stmt.value);
        break;
    }
    if (stackAddressName) {
      throw new CompilerError(
        `Potential use-after-free: returning address of stack variable '${stackAddressName}'`,
        `Variable '${stackAddressName}' is allocated on the stack and will be invalidated when the function returns. To suppress this error (unsafe), prefix the variable name with '_' (e.g., '_${stackAddressName}').`,
        stmt.location,
      );
    }
  }
}

/**
 * Check a try statement
 */
export function checkTry(this: CheckerContext, stmt: AST.TryStmt): void {
  checkBlock.call(this, stmt.tryBlock);

  // Check catch clauses
  for (const clause of stmt.catchClauses) {
    this.currentScope = this.currentScope.enterScope();
    // Only define variable if it's a typed catch (not catch-all)
    if (clause.variable && clause.type) {
      this.defineSymbol(clause.variable, "Variable", clause.type, clause);
    }
    checkBlock.call(this, clause.body);
    this.currentScope = this.currentScope.exitScope();
  }
}

/**
 * Check a throw statement
 */
export function checkThrow(this: CheckerContext, stmt: AST.ThrowStmt): void {
  this.checkExpression(stmt.expression);
}

/**
 * Check a switch statement
 */
export function checkSwitch(this: CheckerContext, stmt: AST.SwitchStmt): void {
  this.switchDepth++;
  try {
    const valueType = this.checkExpression(stmt.expression);

    if (valueType) {
      const resolvedType = this.resolveType(valueType);
      let isValid = false;

      if (resolvedType.kind === "BasicType") {
        if (INTEGER_TYPES.includes(resolvedType.name)) {
          isValid = true;
        } else {
          const symbol = this.currentScope.resolve(resolvedType.name);
          if (symbol && symbol.kind === "Enum") {
            isValid = true;
          }
        }
      } else if (
        valueType.kind === "BasicType" &&
        valueType.name === "string"
      ) {
        isValid = true;
      }

      if (!isValid) {
        throw new CompilerError(
          `Switch value must be an integer, string or enum type, got ${this.typeToString(
            valueType,
          )}`,
          "Ensure the switch expression evaluates to an integer, string or enum.",
          stmt.expression.location,
          SWITCH_VALUE_TYPE_MISMATCH_CODE,
        );
      }
    }

    const seenValues = new Set<string>();

    for (const caseItem of stmt.cases) {
      const patternType = this.checkExpression(caseItem.value);
      if (
        patternType &&
        valueType &&
        !this.areTypesCompatible(valueType, patternType)
      ) {
        throw new CompilerError(
          `Case pattern type ${this.typeToString(
            patternType,
          )} not compatible with switch value type ${this.typeToString(valueType)}`,
          "Ensure case patterns match the switch value type.",
          caseItem.value.location,
          SWITCH_CASE_TYPE_MISMATCH_CODE,
        );
      }

      // Check for duplicate cases
      // We need to evaluate the constant value of the case expression
      let constVal = this.getIntegerConstantValue(caseItem.value);
      let valStr: string | undefined;

      if (constVal === undefined) {
        if (
          caseItem.value.kind === "Literal" &&
          caseItem.value.type === "string"
        ) {
          valStr = (caseItem.value as AST.LiteralExpr).value as string;
        } else {
          const enumIndex = this.getEnumVariantIndex(caseItem.value);
          if (enumIndex !== undefined) {
            constVal = BigInt(enumIndex);
          }
        }
      }

      if (constVal !== undefined) {
        // Replace non-literal constant expressions (like Enum variants) with Literals
        if (caseItem.value.kind !== "Literal") {
          caseItem.value = {
            kind: "Literal",
            value: Number(constVal),
            raw: constVal.toString(),
            type: "number",
            location: caseItem.value.location,
          } as AST.LiteralExpr;
        }
        valStr = constVal.toString();
      }

      if (valStr !== undefined) {
        if (seenValues.has(valStr)) {
          throw new CompilerError(
            `Duplicate case value '${valStr}'`,
            "Switch cases must have unique values.",
            caseItem.value.location,
          );
        }
        seenValues.add(valStr);
      }

      checkBlock.call(this, caseItem.body);

      if (!isTerminated(caseItem.body)) {
        throw new CompilerError(
          "Switch case must end with a terminator",
          "Add 'break', 'return', 'throw', 'continue', or 'fallthrough' at the end of the case block.",
          caseItem.value.location,
        );
      }
    }

    if (stmt.defaultCase) {
      checkBlock.call(this, stmt.defaultCase);
      if (!isTerminated(stmt.defaultCase)) {
        throw new CompilerError(
          "Default case must end with a terminator",
          "Add 'break', 'return', 'throw', or 'continue' at the end of the default block.",
          stmt.defaultCase.location,
        );
      }
    }
  } finally {
    this.switchDepth--;
  }
}

/**
 * Check a break statement
 */
export function checkBreak(this: CheckerContext, stmt: AST.BreakStmt): void {
  if (this.loopDepth === 0 && this.switchDepth === 0) {
    throw new CompilerError(
      "'break' statement outside of loop or switch",
      "Break statements can only be used inside loops or switch statements.",
      stmt.location,
      BREAK_OUTSIDE_CONTEXT_CODE,
    );
  }
}

/**
 * Check a fallthrough statement
 */
export function checkFallthrough(
  this: CheckerContext,
  stmt: AST.FallthroughStmt,
): void {
  if (this.switchDepth === 0) {
    throw new CompilerError(
      "'fallthrough' statement outside of switch",
      "Fallthrough statements can only be used inside switch statements.",
      stmt.location,
      FALLTHROUGH_OUTSIDE_SWITCH_CODE,
    );
  }
}

/**
 * Check a continue statement
 */
export function checkContinue(
  this: CheckerContext,
  stmt: AST.ContinueStmt,
): void {
  if (this.loopDepth === 0) {
    throw new CompilerError(
      "'continue' statement outside of loop",
      "Continue statements can only be used inside loops.",
      stmt.location,
      CONTINUE_OUTSIDE_LOOP_CODE,
    );
  }
}

/**
 * Check a variable declaration
 */
export function checkVariableDecl(
  this: CheckerContext,
  decl: AST.VariableDecl,
): void {
  if (Array.isArray(decl.name)) {
    // Destructuring - enforce explicit type annotations
    const flattenTargets = (
      targets: any[],
    ): AST.DestructuringTarget[] => {
      const result: AST.DestructuringTarget[] = [];
      for (const target of targets) {
        if (Array.isArray(target)) {
          result.push(...flattenTargets(target));
        } else {
          result.push(target);
        }
      }
      return result;
    };

    const targets = flattenTargets(decl.name);

    const defineDestructuredTarget = (
      target: AST.DestructuringTarget,
      finalType: AST.TypeNode | undefined,
    ): void => {
      if (target.name === "_" || !finalType) return;

      const resolvedType = this.resolveType(finalType);
      const bindingDecl: AST.VariableDecl = {
        kind: "VariableDecl",
        isGlobal: decl.isGlobal,
        isConst: decl.isConst,
        name: target.name,
        typeAnnotation: finalType,
        resolvedType,
        location: decl.location,
      };

      target.bindingDeclaration = bindingDecl;
      this.defineSymbol(
        target.name,
        "Variable",
        resolvedType,
        bindingDecl,
        undefined,
        decl.isConst,
      );
    };

    // Check that all non-underscore targets have explicit type annotations
    for (const target of targets) {
      if (target.name !== "_" && !target.type) {
        throw new CompilerError(
          `Missing type annotation for variable '${target.name}' in destructuring`,
          "All variables in destructuring must have explicit type annotations. Add type annotations like: local (x: int, y: int) = tuple;",
          decl.location,
        );
      }
    }

    const initType = decl.initializer
      ? this.checkExpression(decl.initializer)
      : undefined;

    if (initType && initType.kind === "TupleType") {
      const validateAndAssignTypes = (
        nestedTargets: AST.DestructuringPattern[],
        tupleNode: AST.TypeNode,
      ): void => {
        const resolvedTuple = this.resolveType(tupleNode);
        if (resolvedTuple.kind !== "TupleType") {
          throw new CompilerError(
            "Nested tuple destructuring target used on non-tuple element",
            "Nested destructuring targets require tuple elements.",
            decl.location,
            TUPLE_DESTRUCTURE_TARGET_INVALID_CODE,
          );
        }

        if (nestedTargets.length !== resolvedTuple.types.length) {
          throw new CompilerError(
            `Tuple destructuring has ${nestedTargets.length} targets, but initializer has ${resolvedTuple.types.length} elements`,
            "Destructuring target count must match tuple element count.",
            decl.location,
            TUPLE_DESTRUCTURE_TARGET_INVALID_CODE,
          );
        }

        for (let i = 0; i < nestedTargets.length; i++) {
          const target = nestedTargets[i]!;
          const inferredType = resolvedTuple.types[i];

          if (Array.isArray(target)) {
            if (inferredType) {
              validateAndAssignTypes(target, inferredType);
            }
            continue;
          }

          const finalType = target.type || inferredType;
          if (target.type && inferredType) {
            const resolvedTarget = this.resolveType(target.type);
            const resolvedInferred = this.resolveType(inferredType);
            if (!this.areTypesCompatible(resolvedTarget, resolvedInferred)) {
              throw new CompilerError(
                `Type mismatch: cannot assign ${this.typeToString(
                  resolvedInferred,
                )} to ${this.typeToString(resolvedTarget)}`,
                "Ensure the destructuring target type matches the tuple element type.",
                decl.location,
                "E001",
              );
            }
          }

          defineDestructuredTarget(target, finalType);
        }
      };

      validateAndAssignTypes(
        decl.name as AST.DestructuringPattern[],
        initType,
      );
    } else {
      for (const target of targets) {
        const finalType = target.type || initType;
        defineDestructuredTarget(target, finalType);
      }
    }

    return;
  }

  // Single variable
  // Enforce explicit type annotation (no type inference)
  if (!decl.typeAnnotation) {
    throw new CompilerError(
      `Missing type annotation for variable '${decl.name}'`,
      "Variables must have explicit type annotations. Add a type annotation like: local x: int = 1;",
      decl.location,
      VARIABLE_TYPE_ANNOTATION_MISSING_CODE,
    );
  }

  this.ensureKnownType(decl.typeAnnotation);
  const declaredType = this.resolveType(decl.typeAnnotation);

  // Check for void type (BUG-060)
  if (declaredType) {
    if (
      declaredType.kind === "BasicType" &&
      declaredType.name === "void" &&
      declaredType.pointerDepth === 0
    ) {
      this.addError(
        new CompilerError(
          `Variable '${decl.name}' cannot be void.`,
          "Variables cannot have type 'void'. Use '*void' for void pointers.",
          decl.location,
          VOID_TYPE_INVALID_CODE,
        ),
      );
    }
  }

  if (declaredType) {
    decl.resolvedType = declaredType;
  }
  let initType: AST.TypeNode | undefined;

  if (decl.initializer) {
    if (declaredType && this.matchContext) {
      this.matchContext.push({ expectedType: declaredType, inferredTypes: [] });
    }
    try {
      initType = this.checkExpression(decl.initializer);
    } finally {
      if (declaredType && this.matchContext) {
        this.matchContext.pop();
      }
    }

    if (initType) {
      if (declaredType) {
        // Infer generic arguments for enum variants if target type has them
        if (
          declaredType.kind === "BasicType" &&
          declaredType.genericArgs.length > 0 &&
          initType.kind === "BasicType" &&
          initType.name === declaredType.name &&
          (!initType.genericArgs || initType.genericArgs.length === 0)
        ) {
          // Check if initializer is an enum variant
          const enumVariantInfo = (decl.initializer as any).enumVariantInfo;
          if (enumVariantInfo) {
            // Update generic args
            enumVariantInfo.genericArgs = declaredType.genericArgs;
            // Also update initType to match declaredType
            initType = declaredType;
            // Update resolvedType on initializer
            decl.initializer.resolvedType = declaredType;
          }
        }

        const resolvedInit =
          decl.initializer.resolvedType ?? this.resolveType(initType);
        const resolvedDecl = declaredType;

        // Check for integer constant compatibility
        const constVal = this.getIntegerConstantValue(decl.initializer);
        if (constVal !== undefined) {
          if (
            constVal === 0n ||
            this.isIntegerTypeCompatible(constVal, resolvedDecl)
          ) {
            // Annotate the literal for codegen
            if (
              decl.initializer.kind === "Literal" ||
              decl.initializer.kind === "Unary"
            ) {
              decl.initializer.resolvedType = resolvedDecl;
            }
          } else if (
            resolvedDecl.kind === "BasicType" &&
            INTEGER_TYPES.includes(resolvedDecl.name)
          ) {
            throw new CompilerError(
              `Integer overflow: value ${constVal} does not fit in type ${this.typeToString(
                resolvedDecl,
              )}`,
              `Ensure the value is within the range of ${this.typeToString(resolvedDecl)}.`,
              decl.location,
              INTEGER_LITERAL_OVERFLOW_CODE,
            );
          } else if (!this.areTypesCompatible(resolvedDecl, resolvedInit)) {
            // Check for implicit pointer-to-value conversion for struct literals
            // Allow assigning StructLiteral to *Struct (allocates on stack)
            const isStructLiteralToPointer =
              resolvedDecl.kind === "BasicType" &&
              resolvedInit.kind === "BasicType" &&
              resolvedDecl.name === resolvedInit.name &&
              resolvedDecl.pointerDepth === resolvedInit.pointerDepth + 1 &&
              decl.initializer?.kind === "StructLiteral";

            if (!isStructLiteralToPointer) {
              throw new CompilerError(
                `Type mismatch: cannot assign ${this.typeToString(
                  resolvedInit,
                )} to ${this.typeToString(resolvedDecl)}`,
                "Ensure the initializer type matches the declared type.",
                decl.location,
                "E001",
              );
            }
          }
        } else if (!this.areTypesCompatible(resolvedDecl, resolvedInit)) {
          // Check for implicit pointer-to-value conversion for struct literals
          // Allow assigning StructLiteral to *Struct (allocates on stack)
          const isStructLiteralToPointer =
            resolvedDecl.kind === "BasicType" &&
            resolvedInit.kind === "BasicType" &&
            resolvedDecl.name === resolvedInit.name &&
            resolvedDecl.pointerDepth === resolvedInit.pointerDepth + 1 &&
            decl.initializer?.kind === "StructLiteral";

          if (!isStructLiteralToPointer) {
            throw new CompilerError(
              `Type mismatch: cannot assign ${this.typeToString(
                resolvedInit,
              )} to ${this.typeToString(resolvedDecl)}`,
              "Ensure the initializer type matches the declared type.",
              decl.location,
              "E001",
            );
          }
        }
        // Type annotation is required, so we already have declaredType
      } else {
        // No declared type check needed since we enforce type annotations above
      }
    }
  }

  if (!declaredType) {
    throw new CompilerError(
      `Cannot infer type for variable '${decl.name}'`,
      "Either provide a type annotation or an initializer.",
      decl.location,
    );
  }

  decl.resolvedType = declaredType;

  // Check for shadowing in current scope
  const existing = this.currentScope.getInCurrentScope(decl.name as string);
  if (existing) {
    throw new CompilerError(
      `Variable '${decl.name}' is already declared in this scope`,
      `Cannot redeclare '${decl.name}' in the same scope.`,
      decl.location,
      VARIABLE_REDECLARATION_CODE,
    );
  }

  const shadowed = this.currentScope.findInOuterScopes(decl.name as string);
  if (
    shadowed &&
    (shadowed.kind === "Variable" || shadowed.kind === "Parameter")
  ) {
    const shadowedKind = getShadowedValueKind(shadowed);
    this.addWarning(
      new CompilerError(
        `Variable '${decl.name}' shadows ${shadowedKind} from an outer scope`,
        `Rename '${decl.name}' or the outer ${shadowedKind} to make the scope relationship explicit.`,
        decl.location,
      )
        .setSeverity(DiagnosticSeverity.Warning)
        .addRelatedLocation(
          shadowed.declaration.location,
          `Outer ${shadowedKind} '${shadowed.name}' declared here`,
        ),
    );
  }

  this.defineSymbol(
    decl.name as string,
    "Variable",
    declaredType,
    decl,
    undefined,
    decl.isConst,
  );
  decl.resolvedType = declaredType;
}

/**
 * Check if all paths in a statement return
 */
export function checkAllPathsReturn(
  this: CheckerContext,
  stmt: AST.Statement,
): boolean {
  switch (stmt.kind) {
    case "Return":
      return true;
    case "Block": {
      const lastIndex = stmt.statements.length - 1;
      if (
        lastIndex >= 0 &&
        checkAllPathsReturn.call(this, stmt.statements[lastIndex]!)
      ) {
        return true;
      }
      for (let i = 0; i < lastIndex; i++) {
        if (checkAllPathsReturn.call(this, stmt.statements[i]!)) return true;
      }
      return false;
    }
    case "If":
      if (!stmt.elseBranch) return false;
      return (
        checkAllPathsReturn.call(this, stmt.thenBranch) &&
        checkAllPathsReturn.call(this, stmt.elseBranch)
      );
    case "Loop":
      // Loops don't guarantee return
      return false;
    case "Switch":
      // Check if all cases return (simplified)
      if (!stmt.cases || stmt.cases.length === 0) return false;
      for (const c of stmt.cases) {
        let caseReturns = false;
        for (const s of c.body.statements) {
          if (checkAllPathsReturn.call(this, s)) {
            caseReturns = true;
            break;
          }
        }
        if (!caseReturns) return false;
      }
      return true;
    case "Throw":
      return true;
    case "ExpressionStmt": {
      // Check if this is a match expression where all arms return
      const exprStmt = stmt as AST.ExpressionStmt;
      if (exprStmt.expression.kind === "Match") {
        const matchExpr = exprStmt.expression as AST.MatchExpr;
        // Check if all arms have a return (or throw) in their body
        if (matchExpr.arms.length === 0) return false;
        for (const arm of matchExpr.arms) {
          let armReturns = false;
          if (arm.body.kind === "Block") {
            // Block body - check if any statement returns
            for (const s of (arm.body as AST.BlockStmt).statements) {
              if (checkAllPathsReturn.call(this, s)) {
                armReturns = true;
                break;
              }
            }
          } else {
            // Expression body - doesn't contain return statements
            armReturns = false;
          }
          if (!armReturns) return false;
        }
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Check an asm block statement
 */
export function checkAsm(this: CheckerContext, stmt: AST.AsmBlockStmt): void {
  // Match the operand forms accepted by codegen:
  // (varName), (&varName), (=varName), and optional LLVM constraints.
  const regex = /\((=?)(&?)(\w+)(?::\s*"([^"]+)")?\)/g;
  let match;
  while ((match = regex.exec(stmt.content)) !== null) {
    const varName = match[3];
    const symbol = this.currentScope.resolve(varName!);
    if (!symbol) {
      throw new CompilerError(
        `Undefined variable '${varName}' in asm block`,
        "Variables used in asm blocks must be defined in the current scope.",
        stmt.location,
      );
    }
  }
}

/**
 * Check a defer statement
 */
export function checkDefer(this: CheckerContext, stmt: AST.DeferStmt): void {
  const prevInDefer = this.inDefer;
  this.inDefer = true;
  try {
    this.checkStatement(stmt.statement);
  } finally {
    this.inDefer = prevInDefer;
  }
}

function isTerminated(block: AST.BlockStmt): boolean {
  if (block.statements.length === 0) {
    return false;
  }
  const last = block.statements[block.statements.length - 1];
  if (!last) return false;
  const kind = last.kind as string;

  return (
    kind === "Return" ||
    kind === "Break" ||
    kind === "Continue" ||
    kind === "Throw" ||
    kind === "Fallthrough"
  );
}
