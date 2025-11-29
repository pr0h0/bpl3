# Compiler Internals

This document describes the internal architecture of the BPL compiler. It is intended for contributors who want to understand how the compiler works or add new features.

## Architecture Overview

The BPL compiler follows a standard multi-pass architecture:

1.  **Lexical Analysis (Lexer)**: Converts source code into a stream of tokens.
2.  **Parsing (Parser)**: Converts the stream of tokens into an Abstract Syntax Tree (AST).
3.  **Transpilation (Transpiler)**: Traverses the AST and generates x86-64 assembly code.
4.  **Optimization**: Optimizes the generated assembly code.

## 1. Lexer (`lexer/`)

The lexer (`lexer.ts`) reads the source code character by character and groups them into tokens (`token.ts`).

-   **Tokens**: Represent atomic units like keywords (`frame`, `if`), identifiers (`myVar`), literals (`123`, `"hello"`), and operators (`+`, `=`).
-   **TokenType**: An enum defining all possible token types.

## 2. Parser (`parser/`)

The parser (`parser.ts`) uses a recursive descent approach to build the AST.

-   **Expressions**: All AST nodes inherit from the `Expr` class (`expression/expr.ts`).
-   **Structure**: The AST reflects the hierarchical structure of the program (e.g., a `ProgramExpr` contains a list of `FunctionDeclaration`s).

### Key AST Nodes:
-   `FunctionDeclaration`: Represents a `frame`.
-   `VariableDeclarationExpr`: Represents `local` or `global` variables.
-   `BinaryExpr`: Represents operations like `a + b`.
-   `IfExpr`, `LoopExpr`: Control flow structures.

## 3. Transpiler (`transpiler/`)

The transpiler is responsible for generating assembly code from the AST.

-   **`AsmGenerator.ts`**: A helper class that manages the output buffers (`.text`, `.data`, `.bss`) and provides methods to emit assembly instructions.
-   **`Scope.ts`**: Manages variable scopes (global vs. local), symbol tables, and type information.
-   **`transpile()` method**: Each AST node implements a `transpile(gen: AsmGenerator, scope: Scope)` method that emits the corresponding assembly code.

### Stack Management
BPL uses the stack for local variables.
-   **RBP (Base Pointer)**: Points to the base of the current stack frame.
-   **RSP (Stack Pointer)**: Points to the top of the stack.
-   Local variables are accessed via offsets from RBP (e.g., `[rbp - 8]`).

## 4. Optimizer (`transpiler/optimizer/`)

The optimizer (`Optimizer.ts`) runs on the generated assembly code (peephole optimization). It applies a series of rules to simplify instructions and improve performance.

### Optimization Levels
-   **Level 1**: Basic simplifications (e.g., `add rax, 0` -> removed).
-   **Level 2**: Control flow and stack optimizations (e.g., removing redundant push/pop).
-   **Level 3**: Advanced instruction combining.

### Implemented Rules:
-   **`MovRegToSameRegRule`**: Removes `mov rax, rax`.
-   **`MovZeroRule`**: Replaces `mov rax, 0` with `xor rax, rax`.
-   **`IncDecRule`**: Replaces `add rax, 1` with `inc rax`.
-   **`RedundantPushPopRule`**: Removes `push rax` followed immediately by `pop rax`.
-   **`JmpNextLabelRule`**: Removes jumps to the very next line.

## 5. Type System

BPL is statically typed. Types are tracked in the `Scope`. Types are more type hints than strict types.

-   **Primitive Types**: `u8`, `u64`, etc.
-   **Pointers**: Represented by `isPointer` flag or wrapper types.
-   **Structs**: User-defined types stored in the scope.
-   **Arrays**: Fixed-size arrays.

## Adding a New Feature

To add a new feature (e.g., a new loop type):

1.  **Lexer**: Add new keywords/tokens if necessary.
2.  **Parser**: Create a new AST node class (e.g., `ForLoopExpr`) and update the parser to recognize the syntax.
3.  **Transpiler**: Implement the `transpile` method for the new AST node to generate the correct assembly.
4.  **Tests**: Add unit tests and integration tests.
