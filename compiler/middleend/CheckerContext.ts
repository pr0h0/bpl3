import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";
import { type Symbol, type SymbolKind, SymbolTable } from "./SymbolTable";

/**
 * Unified context interface for all checker modules.
 * This interface defines the methods and properties that must be available
 * on the TypeChecker instance when bound to checker functions.
 */
export interface CheckerContext {
  // State
  currentScope: SymbolTable;
  globalScope: SymbolTable;
  currentFunctionReturnType: AST.TypeNode | undefined;
  loopDepth: number;
  inDefer: boolean;
  errors: CompilerError[];
  collectAllErrors: boolean;
  matchContext: {
    expectedType?: AST.TypeNode;
    inferredTypes: AST.TypeNode[];
  }[];

  // Core Checking
  checkExpression(expr: AST.Expression): AST.TypeNode | undefined;
  checkStatement(stmt: AST.Statement): void;
  checkBlock(stmt: AST.BlockStmt, newScope?: boolean): void;

  // Type Resolution & Compatibility
  resolveType(type: AST.TypeNode, checkConstraints?: boolean): AST.TypeNode;
  areTypesCompatible(
    t1: AST.TypeNode,
    t2: AST.TypeNode,
    checkConstraints?: boolean,
  ): boolean;
  typeToString(type: AST.TypeNode | undefined): string;
  substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode;
  isCastAllowed(source: AST.TypeNode, target: AST.TypeNode): boolean;

  // Error Handling
  addError(error: CompilerError): void;

  // Symbol Management
  defineSymbol(
    name: string,
    kind: SymbolKind,
    type: AST.TypeNode | undefined,
    node: AST.ASTNode,
    moduleScope?: SymbolTable,
    isConst?: boolean,
  ): void;
  hoistDeclaration(stmt: AST.Statement): void;

  // Type Helpers
  isBoolType(type: AST.TypeNode): boolean;
  makeVoidType(): AST.TypeNode;
  isIntegerTypeCompatible(val: bigint, targetType: AST.TypeNode): boolean;
  getIntegerConstantValue(expr: AST.Expression): bigint | undefined;
  getEnumVariantIndex(expr: AST.Expression): number | undefined;

  // Overload & Member Resolution
  findOperatorOverload(
    targetType: AST.TypeNode,
    methodName: string,
    paramTypes: AST.TypeNode[],
  ): AST.FunctionDecl | undefined;
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
  };
  resolveMemberWithContext(
    baseType: AST.BasicTypeNode,
    memberName: string,
  ):
    | {
        decl: AST.StructDecl | AST.SpecDecl | AST.EnumDecl;
        members: (AST.FunctionDecl | AST.StructField | AST.SpecMethod)[];
        genericMap?: Map<string, AST.TypeNode>;
      }
    | undefined;
  resolveStructField(
    decl: AST.StructDecl,
    fieldName: string,
  ): { field: AST.StructField; type: AST.TypeNode } | undefined;

  // Pattern Matching
  checkMatchExhaustiveness(expr: AST.MatchExpr, enumDecl: AST.EnumDecl): void;
  checkPattern(
    pattern: AST.Pattern,
    enumType: AST.TypeNode,
    enumDecl: AST.EnumDecl | undefined,
  ): void;
  checkMatchArmBody(
    body: AST.Expression | AST.BlockStmt,
  ): AST.TypeNode | undefined;
}
