import { Token } from "../frontend/Token";
import type { SourceLocation } from "./CompilerError";

export interface ASTNode {
  kind: string;
  location: SourceLocation;
  resolvedType?: TypeNode;
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
  resolvedDeclaration?: StructDecl;
}

export interface TupleTypeNode extends ASTNode {
  kind: "TupleType";
  types: TypeNode[];
}

export interface FunctionTypeNode extends ASTNode {
  kind: "FunctionType";
  returnType: TypeNode;
  paramTypes: TypeNode[];
  isVariadic?: boolean;
  declaration?: FunctionDecl;
}

// --- Expressions ---

export type Expression =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | ArrayLiteralExpr
  | StructLiteralExpr
  | TupleLiteralExpr
  | CastExpr
  | SizeofExpr
  | MatchExpr
  | AssignmentExpr
  | TernaryExpr
  | GenericInstantiationExpr;

export interface LiteralExpr extends ASTNode {
  kind: "Literal";
  value: any;
  raw: string;
  type: "string" | "number" | "bool" | "char" | "null" | "nullptr" | "unit";
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
}

export interface UnaryExpr extends ASTNode {
  kind: "Unary";
  operator: Token;
  operand: Expression;
  isPrefix: boolean;
}

export interface CallExpr extends ASTNode {
  kind: "Call";
  callee: Expression;
  args: Expression[];
  genericArgs: TypeNode[];
  resolvedDeclaration?: FunctionDecl | ExternDecl;
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
}

export interface ArrayLiteralExpr extends ASTNode {
  kind: "ArrayLiteral";
  elements: Expression[];
}

export interface StructLiteralExpr extends ASTNode {
  kind: "StructLiteral";
  structName: string; // Added
  fields: { name: string; value: Expression }[];
}

export interface TupleLiteralExpr extends ASTNode {
  kind: "TupleLiteral";
  elements: Expression[];
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

export interface MatchExpr extends ASTNode {
  kind: "Match";
  targetType: TypeNode;
  value: Expression | TypeNode;
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

// --- Statements ---

export type Statement =
  | VariableDecl
  | FunctionDecl
  | StructDecl
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
  name: string | { name: string; type?: TypeNode }[]; // Simple name or destructuring
  typeAnnotation?: TypeNode;
  initializer?: Expression;
}

export interface FunctionDecl extends ASTNode {
  kind: "FunctionDecl";
  isFrame: boolean; // frame vs static
  isStatic: boolean;
  name: string;
  genericParams: string[];
  params: { name: string; type: TypeNode }[];
  returnType: TypeNode;
  body: BlockStmt;
}

export interface StructDecl extends ASTNode {
  kind: "StructDecl";
  name: string;
  genericParams: string[];
  parentType?: TypeNode; // Inheritance
  members: (StructField | FunctionDecl)[];
}

export interface StructField extends ASTNode {
  kind: "StructField";
  name: string;
  type: TypeNode;
}

export interface TypeAliasDecl extends ASTNode {
  kind: "TypeAlias";
  name: string;
  genericParams: string[];
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
  items: { name: string; alias?: string; isType: boolean }[];
  source: string;
  importAll?: boolean; // If true, import all exported symbols
  namespace?: string; // If set, import into this namespace
}

export interface ExportStmt extends ASTNode {
  kind: "Export";
  item: string;
  isType: boolean;
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
