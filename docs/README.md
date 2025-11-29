# BPL (Basic Programming Language) Documentation

Welcome to the official documentation for BPL, a statically typed, compiled programming language designed for learning compiler construction and low-level programming concepts. BPL transpiles to x86-64 Assembly (NASM).

## Table of Contents

1. [Getting Started](./getting_started.md)
   - Installation
   - Your First Program
   - Compiling and Running
2. [Language Syntax](./syntax.md)
   - Variables and Types
   - Functions (`frame`)
   - Control Flow (`if`, `loop`)
   - Structs and Arrays
   - Pointers
3. [Standard Library & Imports](./standard_library.md)
   - Built-in functions
   - Importing from C libraries
   - Module system
4. [Advanced Features](./advanced_features.md)
   - Inline Assembly
   - Memory Management
   - System Calls
5. [Compiler Internals](./internals.md)
   - Architecture
   - Lexer, Parser, Transpiler
   - Optimizer
6. [Testing](./testing.md)
   - Running tests
   - Writing new tests
7. [Examples Cookbook](./examples.md)
   - Fibonacci
   - Linked Lists
   - Hotel Management

## Project Structure

- `docs/`: Documentation files.
- `lexer/`: Lexer implementation for BPL.
- `parser/`: Parser implementation for BPL.
- `transpiler/`: Source code for the BPL compiler (written in TypeScript).
- `lib/`: Standard library files for BPL.
- `example/`: Example BPL programs.
- `tests/`: Unit tests for the compiler.
- `vs-code-ext/`: VS Code extension for BPL syntax highlighting.

## Contributing

This project is open for contributions. Please check the `TODO.md` file for planned features and improvements.
