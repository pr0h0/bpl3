/**
 * StatementChecker - Handles type checking of statements
 * These methods are designed to be bound to a TypeChecker instance using .call()
 */

import * as AST from "../common/AST";
import {
  CompilerError,
  DiagnosticSeverity,
  type SourceLocation,
} from "../common/CompilerError";
import type { Symbol, SymbolKind } from "./SymbolTable";
import { INTEGER_TYPES } from "./TypeUtils";

/**
 * Type for the TypeChecker context that statement checkers need access to
 */
export interface StatementCheckerContext {
  currentScope: any;
  globalScope: any;
  currentFunctionReturnType: AST.TypeNode | undefined;
  loopDepth: number;
  errors: CompilerError[];
  collectAllErrors: boolean;
  checkExpression(expr: AST.Expression): AST.TypeNode | undefined;
  checkStatement(stmt: AST.Statement): void;
  resolveType(type: AST.TypeNode, checkConstraints?: boolean): AST.TypeNode;
  areTypesCompatible(
    t1: AST.TypeNode,
    t2: AST.TypeNode,
    checkConstraints?: boolean,
  ): boolean;
  typeToString(type: AST.TypeNode | undefined): string;
  defineSymbol(
    name: string,
    kind: SymbolKind,
    type: AST.TypeNode | undefined,
    node: AST.ASTNode,
    moduleScope?: any,
    isConst?: boolean,
  ): void;
  isBoolType(type: AST.TypeNode): boolean;
  makeVoidType(): AST.TypeNode;
  getIntegerConstantValue(expr: AST.Expression): bigint | undefined;
  isIntegerTypeCompatible(val: bigint, targetType: AST.TypeNode): boolean;
  hoistDeclaration(stmt: AST.Statement): void;
  matchContext?: {
    expectedType?: AST.TypeNode;
    inferredTypes: AST.TypeNode[];
  }[];
}

/**
 * Check a block statement
 */
export function checkBlock(
  this: StatementCheckerContext,
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
      s.kind === "Throw"
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
export function checkIf(this: StatementCheckerContext, stmt: AST.IfStmt): void {
  const condType = this.checkExpression(stmt.condition);
  if (condType && !this.isBoolType(condType)) {
    throw new CompilerError(
      `If condition must be boolean, got ${this.typeToString(condType)}`,
      "Ensure the condition evaluates to a boolean.",
      stmt.condition.location,
    );
  }
  this.checkStatement(stmt.thenBranch);
  if (stmt.elseBranch) {
    this.checkStatement(stmt.elseBranch);
  }
}

/**
 * Check a loop statement (for/while)
 */
export function checkLoop(
  this: StatementCheckerContext,
  stmt: AST.LoopStmt,
): void {
  this.loopDepth++;
  if (stmt.condition) {
    const condType = this.checkExpression(stmt.condition);
    if (condType && !this.isBoolType(condType)) {
      throw new CompilerError(
        `Loop condition must be boolean, got ${this.typeToString(condType)}`,
        "Ensure the condition evaluates to a boolean.",
        stmt.condition.location,
      );
    }
  }
  checkBlock.call(this, stmt.body);
  this.loopDepth--;
}

/**
 * Check a return statement
 */
export function checkReturn(
  this: StatementCheckerContext,
  stmt: AST.ReturnStmt,
): void {
  const returnType = stmt.value
    ? this.checkExpression(stmt.value)
    : this.makeVoidType();

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
      );
    }
  }
}

/**
 * Check a try statement
 */
export function checkTry(
  this: StatementCheckerContext,
  stmt: AST.TryStmt,
): void {
  checkBlock.call(this, stmt.tryBlock);

  // Check catch clauses
  for (const clause of stmt.catchClauses) {
    this.currentScope = this.currentScope.enterScope();
    this.defineSymbol(clause.variable, "Variable", clause.type, clause);
    checkBlock.call(this, clause.body);
    this.currentScope = this.currentScope.exitScope();
  }

  // Check catch-all clause if present
  if (stmt.catchOther) {
    checkBlock.call(this, stmt.catchOther);
  }
}

/**
 * Check a throw statement
 */
export function checkThrow(
  this: StatementCheckerContext,
  stmt: AST.ThrowStmt,
): void {
  this.checkExpression(stmt.expression);
}

/**
 * Check a switch statement
 */
export function checkSwitch(
  this: StatementCheckerContext,
  stmt: AST.SwitchStmt,
): void {
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
    }

    if (!isValid) {
      throw new CompilerError(
        `Switch value must be an integer or enum type, got ${this.typeToString(
          valueType,
        )}`,
        "Ensure the switch expression evaluates to an integer or enum.",
        stmt.expression.location,
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
      );
    }

    // Check for duplicate cases
    // We need to evaluate the constant value of the case expression
    const constVal = this.getIntegerConstantValue(caseItem.value);
    if (constVal !== undefined) {
      const valStr = constVal.toString();
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
  }

  if (stmt.defaultCase) {
    checkBlock.call(this, stmt.defaultCase);
  }
}

/**
 * Check a break statement
 */
export function checkBreak(
  this: StatementCheckerContext,
  stmt: AST.BreakStmt,
): void {
  if (this.loopDepth === 0) {
    throw new CompilerError(
      "'break' statement outside of loop",
      "Break statements can only be used inside loops.",
      stmt.location,
    );
  }
}

/**
 * Check a continue statement
 */
export function checkContinue(
  this: StatementCheckerContext,
  stmt: AST.ContinueStmt,
): void {
  if (this.loopDepth === 0) {
    throw new CompilerError(
      "'continue' statement outside of loop",
      "Continue statements can only be used inside loops.",
      stmt.location,
    );
  }
}

/**
 * Check a variable declaration
 */
export function checkVariableDecl(
  this: StatementCheckerContext,
  decl: AST.VariableDecl,
): void {
  if (Array.isArray(decl.name)) {
    // Destructuring
    const flattenTargets = (
      targets: any[],
    ): { name: string; type?: AST.TypeNode }[] => {
      const result: { name: string; type?: AST.TypeNode }[] = [];
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
    const initType = decl.initializer
      ? this.checkExpression(decl.initializer)
      : undefined;

    if (initType && initType.kind === "TupleType") {
      const tupleType = initType as AST.TupleTypeNode;

      const flattenNames = (targets: any[]): string[] => {
        const result: string[] = [];
        for (const t of targets) {
          if (Array.isArray(t)) {
            result.push(...flattenNames(t));
          } else if (typeof t === "string") {
            result.push(t);
          } else if (t && typeof t === "object" && "name" in t) {
            result.push(t.name);
          }
        }
        return result;
      };

      const names = flattenNames(decl.name);

      const assignTypes = (
        names: string[],
        types: AST.TypeNode[],
        explicit: (AST.TypeNode | undefined)[],
      ): void => {
        for (let i = 0; i < names.length; i++) {
          const name = names[i]!;
          const inferredType = types[i];
          const explicitType = explicit[i];

          if (name === "_") continue;

          const finalType = explicitType || inferredType;
          if (finalType) {
            this.defineSymbol(
              name,
              "Variable",
              this.resolveType(finalType),
              decl,
              undefined,
              decl.isConst,
            );
          }
        }
      };

      const explicitTypes = targets.map((t) => t.type);
      assignTypes(names, tupleType.types, explicitTypes);
    } else {
      for (const target of targets) {
        if (target.name === "_") continue;
        const finalType = target.type || initType;
        if (finalType) {
          this.defineSymbol(
            target.name,
            "Variable",
            this.resolveType(finalType),
            decl,
            undefined,
            decl.isConst,
          );
        }
      }
    }

    return;
  }

  // Single variable
  let declaredType = decl.typeAnnotation
    ? this.resolveType(decl.typeAnnotation)
    : undefined;

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

        const resolvedInit = this.resolveType(initType);
        const resolvedDecl = this.resolveType(declaredType);

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
              `Ensure the value is within the range of ${this.typeToString(
                resolvedDecl,
              )}.`,
              decl.location,
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
      } else {
        declaredType = this.resolveType(initType);
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
  this: StatementCheckerContext,
  stmt: AST.Statement,
): boolean {
  switch (stmt.kind) {
    case "Return":
      return true;
    case "Block":
      for (const s of stmt.statements) {
        if (checkAllPathsReturn.call(this, s)) return true;
      }
      return false;
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
    default:
      return false;
  }
}
