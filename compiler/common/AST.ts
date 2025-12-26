import { Token } from "../frontend/Token";

import type { SourceLocation } from "./CompilerError";

export interface ASTNode {
  kind: string;
  location: SourceLocation;
  resolvedType?: TypeNode;
  documentation?: string;
}

export interface GenericParam {
  name: string;
  constraint?: TypeNode;
  location?: SourceLocation;
}

// --- Types ---

export type TypeNode =
  | BasicTypeNode
  | TupleTypeNode
  | FunctionTypeNode
  | MetaType;

export interface BasicTypeNode extends ASTNode {
  kind: "BasicType";
  name: string;
  genericArgs: TypeNode[];
  pointerDepth: number;
  arrayDimensions: (number | null)[];
  resolvedDeclaration?: StructDecl | EnumDecl | SpecDecl;
  isConst?: boolean;
}

export interface TupleTypeNode extends ASTNode {
  kind: "TupleType";
  types: TypeNode[];
  isConst?: boolean;
}

export interface FunctionTypeNode extends ASTNode {
  kind: "FunctionType";
  returnType: TypeNode;
  paramTypes: TypeNode[];
  isVariadic?: boolean;
  declaration?: FunctionDecl;
  isConst?: boolean;
}

// --- Expressions ---

export type Expression =
  | LiteralExpr
  | InterpolatedStringExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | ArrayLiteralExpr
  | StructLiteralExpr
  | TupleLiteralExpr
  | EnumStructVariantExpr
  | CastExpr
  | SizeofExpr
  | TypeMatchExpr
  | MatchExpr
  | AssignmentExpr
  | TernaryExpr
  | GenericInstantiationExpr
  | LambdaExpr
  | IsExpr
  | AsExpr;

export interface IsExpr extends ASTNode {
  kind: "Is";
  expression: Expression;
  type: TypeNode;
}

export interface AsExpr extends ASTNode {
  kind: "As";
  expression: Expression;
  type: TypeNode;
}

export interface LiteralExpr extends ASTNode {
  kind: "Literal";
  value: any;
  raw: string;
  type: "string" | "number" | "bool" | "char" | "null" | "nullptr" | "unit";
}

export interface InterpolatedStringExpr extends ASTNode {
  kind: "InterpolatedString";
  parts: Expression[];
  desugared?: Expression;
}

export interface IdentifierExpr extends ASTNode {
  kind: "Identifier";
  name: string;
  resolvedDeclaration?: FunctionDecl | ExternDecl | VariableDecl | StructDecl;
}

export interface BinaryExpr extends ASTNode {
  kind: "Binary";
  left: Expression;
  operator: Token;
  right: Expression;
  operatorOverload?: {
    methodName: string;
    targetType: TypeNode;
    methodDeclaration: FunctionDecl;
    swapOperands?: boolean;
    negateResult?: boolean;
  };
}

export interface UnaryExpr extends ASTNode {
  kind: "Unary";
  operator: Token;
  operand: Expression;
  isPrefix: boolean;
  operatorOverload?: {
    methodName: string;
    targetType: TypeNode;
    methodDeclaration: FunctionDecl;
  };
}

export interface CallExpr extends ASTNode {
  kind: "Call";
  callee: Expression;
  args: Expression[];
  genericArgs: TypeNode[];
  resolvedDeclaration?: FunctionDecl | ExternDecl;
  operatorOverload?: {
    methodName: string; // "__call__"
    targetType: TypeNode;
    methodDeclaration: FunctionDecl;
  };
}

export interface MemberExpr extends ASTNode {
  kind: "Member";
  object: Expression;
  property: string;
}

export interface IndexExpr extends ASTNode {
  kind: "Index";
  object: Expression;
  index: Expression;
  operatorOverload?: {
    methodName: string; // "__get__" or "__set__"
    targetType: TypeNode;
    methodDeclaration: FunctionDecl;
  };
}

export interface ArrayLiteralExpr extends ASTNode {
  kind: "ArrayLiteral";
  elements: Expression[];
}

export interface StructLiteralExpr extends ASTNode {
  kind: "StructLiteral";
  structName: string; // Added
  fields: { name: string; value: Expression }[];
  genericArgs?: TypeNode[];
}

export interface TupleLiteralExpr extends ASTNode {
  kind: "TupleLiteral";
  elements: Expression[];
}

export interface EnumStructVariantExpr extends ASTNode {
  kind: "EnumStructVariant";
  enumName: string;
  variantName: string;
  fields: { name: string; value: Expression }[];
}

export interface CastExpr extends ASTNode {
  kind: "Cast";
  targetType: TypeNode;
  expression: Expression;
}

export interface SizeofExpr extends ASTNode {
  kind: "Sizeof";
  target: Expression | TypeNode;
}

// Type match expression: match<Type>(value)
export interface TypeMatchExpr extends ASTNode {
  kind: "TypeMatch";
  targetType: TypeNode;
  value: Expression | TypeNode;
}

// Pattern matching expression: match (value) { Pattern => Expr, ... }
export interface MatchExpr extends ASTNode {
  kind: "Match";
  value: Expression;
  arms: MatchArm[];
}

export interface MatchArm extends ASTNode {
  kind: "MatchArm";
  pattern: Pattern;
  guard?: Expression;
  body: Expression | BlockStmt;
}

// Pattern types for pattern matching
export type Pattern =
  | PatternWildcard
  | PatternLiteral
  | PatternIdentifier
  | PatternEnum
  | PatternEnumTuple
  | PatternEnumStruct;

export interface PatternWildcard extends ASTNode {
  kind: "PatternWildcard";
}

export interface PatternLiteral extends ASTNode {
  kind: "PatternLiteral";
  value: LiteralExpr;
}

export interface PatternIdentifier extends ASTNode {
  kind: "PatternIdentifier";
  name: string;
  type?: TypeNode;
}

export interface PatternEnum extends ASTNode {
  kind: "PatternEnum";
  enumName: string;
  variantName: string;
  genericArgs?: TypeNode[];
}

export interface PatternEnumTuple extends ASTNode {
  kind: "PatternEnumTuple";
  enumName: string;
  variantName: string;
  bindings: string[];
  genericArgs?: TypeNode[];
}

export interface PatternEnumStruct extends ASTNode {
  kind: "PatternEnumStruct";
  enumName: string;
  variantName: string;
  fields: { fieldName: string; binding: string }[];
  genericArgs?: TypeNode[];
}

export interface AssignmentExpr extends ASTNode {
  kind: "Assignment";
  assignee: Expression;
  operator: Token;
  value: Expression;
}

export interface TernaryExpr extends ASTNode {
  kind: "Ternary";
  condition: Expression;
  trueExpr: Expression;
  falseExpr: Expression;
}

export interface GenericInstantiationExpr extends ASTNode {
  kind: "GenericInstantiation";
  base: Expression;
  genericArgs: TypeNode[];
}

export interface LambdaExpr extends ASTNode {
  kind: "LambdaExpression";
  params: { name: string; type: TypeNode | null; location: SourceLocation }[];
  returnType: TypeNode | null;
  body: BlockStmt;
  // For semantic analysis
  capturedVariables?: VariableDecl[];
  closureStructType?: BasicTypeNode;
}

// --- Statements ---

export type Statement =
  | VariableDecl
  | FunctionDecl
  | StructDecl
  | SpecDecl
  | EnumDecl
  | TypeAliasDecl
  | BlockStmt
  | IfStmt
  | LoopStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ExpressionStmt
  | ImportStmt
  | ExportStmt
  | ExternDecl
  | AsmBlockStmt
  | TryStmt
  | ThrowStmt
  | SwitchStmt;

export interface VariableDecl extends ASTNode {
  kind: "VariableDecl";
  isGlobal: boolean;
  isConst: boolean;
  name: string | { name: string; type?: TypeNode }[]; // Simple name or destructuring
  typeAnnotation?: TypeNode;
  initializer?: Expression;
}

export interface FunctionDecl extends ASTNode {
  kind: "FunctionDecl";
  isFrame: boolean; // frame vs static
  isStatic: boolean;
  name: string;
  genericParams: GenericParam[];
  params: {
    name: string;
    type: TypeNode;
    location: SourceLocation;
    isConst?: boolean;
    isVariadic?: boolean;
  }[];
  returnType: TypeNode;
  body: BlockStmt;
}

export interface StructDecl extends ASTNode {
  kind: "StructDecl";
  name: string;
  genericParams: GenericParam[];
  inheritanceList: TypeNode[]; // First element (if struct) is parent, rest are specs
  members: (StructField | FunctionDecl)[];
}

export interface StructField extends ASTNode {
  kind: "StructField";
  name: string;
  type: TypeNode;
}

export interface SpecDecl extends ASTNode {
  kind: "SpecDecl";
  name: string;
  genericParams: GenericParam[];
  extends: TypeNode[]; // Parent specs
  methods: SpecMethod[];
}

export interface SpecMethod extends ASTNode {
  kind: "SpecMethod";
  name: string;
  genericParams: GenericParam[];
  params: {
    name: string;
    type: TypeNode;
    location: SourceLocation;
    isConst?: boolean;
  }[];
  returnType?: TypeNode;
}

export interface EnumDecl extends ASTNode {
  kind: "EnumDecl";
  name: string;
  genericParams: GenericParam[];
  variants: EnumVariant[];
  methods: FunctionDecl[];
}

export interface EnumVariant extends ASTNode {
  kind: "EnumVariant";
  name: string;
  dataType?: EnumVariantData;
}

export type EnumVariantData =
  | EnumVariantUnit
  | EnumVariantTuple
  | EnumVariantStruct;

export interface EnumVariantUnit extends ASTNode {
  kind: "EnumVariantUnit";
}

export interface EnumVariantTuple extends ASTNode {
  kind: "EnumVariantTuple";
  types: TypeNode[];
}

export interface EnumVariantStruct extends ASTNode {
  kind: "EnumVariantStruct";
  fields: { name: string; type: TypeNode }[];
}

export interface TypeAliasDecl extends ASTNode {
  kind: "TypeAlias";
  name: string;
  genericParams: GenericParam[];
  type: TypeNode;
}

export interface BlockStmt extends ASTNode {
  kind: "Block";
  statements: Statement[];
}

export interface IfStmt extends ASTNode {
  kind: "If";
  condition: Expression;
  thenBranch: BlockStmt;
  elseBranch?: Statement; // Block or IfStmt
}

export interface LoopStmt extends ASTNode {
  kind: "Loop";
  condition?: Expression;
  body: BlockStmt;
}

export interface ReturnStmt extends ASTNode {
  kind: "Return";
  value?: Expression;
}

export interface BreakStmt extends ASTNode {
  kind: "Break";
}

export interface ContinueStmt extends ASTNode {
  kind: "Continue";
}

export interface ExpressionStmt extends ASTNode {
  kind: "ExpressionStmt";
  expression: Expression;
}

export interface ImportStmt extends ASTNode {
  kind: "Import";
  items: {
    name: string;
    alias?: string;
    isType: boolean;
    isWrapped?: boolean;
  }[];
  source: string;
  importAll?: boolean; // If true, import all exported symbols
  namespace?: string; // If set, import into this namespace
  isImplicit?: boolean;
}

export interface ExportStmt extends ASTNode {
  kind: "Export";
  items: { name: string; isType: boolean; isWrapped?: boolean }[];
}

export interface ExternDecl extends ASTNode {
  kind: "Extern";
  name: string;
  params: { name: string; type: TypeNode }[];
  isVariadic: boolean;
  returnType?: TypeNode;
}

export interface AsmBlockStmt extends ASTNode {
  kind: "Asm";
  content: string;
  flavor?: string;
}

export interface TryStmt extends ASTNode {
  kind: "Try";
  tryBlock: BlockStmt;
  catchClauses: CatchClause[];
  catchOther?: BlockStmt;
}

export interface CatchClause extends ASTNode {
  kind: "CatchClause";
  variable: string;
  type: TypeNode;
  body: BlockStmt;
}

export interface ThrowStmt extends ASTNode {
  kind: "Throw";
  expression: Expression;
}

export interface SwitchStmt extends ASTNode {
  kind: "Switch";
  expression: Expression;
  cases: SwitchCase[];
  defaultCase?: BlockStmt;
}

export interface SwitchCase extends ASTNode {
  kind: "Case";
  value: Expression;
  body: BlockStmt;
}

export interface Program extends ASTNode {
  kind: "Program";
  statements: Statement[];
  comments?: Token[];
}

export interface MetaType extends ASTNode {
  kind: "MetaType";
  type: TypeNode;
}
