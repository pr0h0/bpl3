# AST (Abstract Syntax Tree) Definitions

export [NodeKind];
export [Node];
export [Statement];
export [Expression];

# Declarations
export [FunctionDecl];
export [StructDecl];
export [EnumDecl];
export [EnumMember];
export [SpecDecl];
export [TypeAliasDecl];
export [VariableDecl];
export [Parameter];

# Statements
export [BlockStmt];
export [IfStmt];
export [LoopStmt];
export [BreakStmt];
export [ContinueStmt];
export [ReturnStmt];
export [DeferStmt];
export [SwitchStmt];
export [SwitchCase];
export [ExpressionStmt];

# Expressions
export [BinaryExpr];
export [UnaryExpr];
export [CallExpr];
export [IdentifierExpr];
export [LiteralExpr];
export [MemberExpr];
export [IndexExpr];
export [CastExpr];
export [AssignmentExpr];

export [TypeNode];
export [BasicTypeNode];
export [FunctionTypeNode];
export [TupleTypeNode];
export [LambdaTypeNode];

import [Span] from "std/diagnostics.bpl";
import [TokenKind], [Token] from "./token.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

enum NodeKind {
    # Base
    Program,

    # Statements / Declarations
    FunctionDecl,
    StructDecl,
    EnumDecl,
    SpecDecl,
    TypeAliasDecl,
    VariableDecl,
    BlockStmt,
    IfStmt,
    LoopStmt,
    BreakStmt,
    ContinueStmt,
    ReturnStmt,
    DeferStmt,
    SwitchStmt,
    ExpressionStmt,

    # Expressions
    BinaryExpr,
    UnaryExpr,
    CallExpr,
    IdentifierExpr,
    LiteralExpr,
    MemberExpr,
    IndexExpr,
    CastExpr,
    AssignmentExpr,

    # Types
    BasicType,
    FunctionType,
    TupleType,
    LambdaType,
}

# Base Node
struct Node {
    kind: NodeKind,
    span: Span,

    # Virtual destructor pattern not auto-generated yet?
    # We will need manual destroy or arena clearing.
}

struct Statement: Node {
    # Marker struct for statements
}

struct Expression: Node {
    # resolvedType: *TypeNode # In the future
}

# --- Declarations ---

struct FunctionDecl: Statement {
    name: String,
    params: Array<*Parameter>,
    returnType: *TypeNode,
    body: *BlockStmt,
    isExtern: bool,
}

struct Parameter: Node {
    name: String,
    typeNode: *TypeNode,
    isVariadic: bool,
}

struct StructDecl: Statement {
    name: String,
    fields: Array<*VariableDecl>,
    methods: Array<*FunctionDecl>,
    generics: Array<String>,
    parent: *TypeNode,
    # Inheritance
}

struct EnumMember: Node {
    name: String,
    values: Array<*TypeNode>,
    # For ADTs like Option.Some(int)
}

struct EnumDecl: Statement {
    name: String,
    members: Array<*EnumMember>,
    generics: Array<String>,
}

struct SpecDecl: Statement {
    name: String,
    methods: Array<*FunctionDecl>,
    generics: Array<String>,
}

struct TypeAliasDecl: Statement {
    name: String,
    target: *TypeNode,
    generics: Array<String>,
}

struct VariableDecl: Statement {
    name: String,
    typeNode: *TypeNode,
    # Optional
    initializer: *Expression,
    # Optional
    isConst: bool,
    isGlobal: bool,
}

struct BlockStmt: Statement {
    statements: Array<*Statement>,
}

struct BreakStmt: Statement {
    # No fields
}

struct ContinueStmt: Statement {
    # No fields
}

struct DeferStmt: Statement {
    body: *BlockStmt,
}

struct SwitchCase: Node {
    pattern: *Expression,
    # Check logic later for pattern types
    body: *BlockStmt,
    isDefault: bool,
}

struct SwitchStmt: Statement {
    discriminant: *Expression,
    cases: Array<*SwitchCase>,
}

# --- Statements ---

struct IfStmt: Statement {
    condition: *Expression,
    thenBranch: *BlockStmt,
    elseBranch: *Statement,
    # BlockStmt or IfStmt
}

struct LoopStmt: Statement {
    condition: *Expression,
    # Optional (infinite loop if null)
    initializer: *Statement,
    # Optional
    step: *Expression,
    # Optional
    body: *BlockStmt,
}

struct ReturnStmt: Statement {
    value: *Expression,
    # Optional
}

struct ExpressionStmt: Statement {
    expr: *Expression,
}

# --- Expressions ---

struct BinaryExpr: Expression {
    left: *Expression,
    right: *Expression,
    op: TokenKind,
}

struct UnaryExpr: Expression {
    operand: *Expression,
    op: TokenKind,
    isPrefix: bool,
}

struct CallExpr: Expression {
    callee: *Expression,
    args: Array<*Expression>,
}

struct IdentifierExpr: Expression {
    name: String,
}

struct LiteralExpr: Expression {
    # We store valid string rep, type checked later
    value: String,
    literalType: TokenKind,
    # Number, String, Char, Bool(KwTrue/False), Nullptr
}

struct MemberExpr: Expression {
    object: *Expression,
    member: String,
}

struct IndexExpr: Expression {
    object: *Expression,
    index: *Expression,
}

struct CastExpr: Expression {
    target: *Expression,
    typeNode: *TypeNode,
    # The type to cast to
}

struct AssignmentExpr: Expression {
    target: *Expression,
    value: *Expression,
}

# --- Types ---

struct TypeNode: Node {
    # Base for types
}

struct BasicTypeNode: TypeNode {
    name: String,
    genericArgs: Array<*TypeNode>,
    pointerDepth: int,
    isArray: bool,
}

struct FunctionTypeNode: TypeNode {
    params: Array<*TypeNode>,
    returnType: *TypeNode,
}

struct TupleTypeNode: TypeNode {
    elements: Array<*TypeNode>,
}

struct LambdaTypeNode: TypeNode {
    params: Array<*TypeNode>,
    returnType: *TypeNode,
}
