# Self-Hosting Compiler Roadmap

This document outlines the requirements, feature gaps, and implementation plan to transition the BPL compiler from a TypeScript application to a self-hosted BPL application.

## 1. Core Goal

**Goal**: Build a compiler for BPL, written in BPL, that compiles to LLVM IR.
**Backend**: We will continue to use LLVM (`llc`) for optimization and binary generation. We are **not** targeting native machine code generation in the immediate future.

## 2. Infrastructure Requirements

### 2.1 Memory Management (Critical)

Compilers allocate millions of small objects (AST nodes, Symbols, Types) that generally live for the entire compilation process. Using `malloc`/`free` for every node is inefficient and complex.

- [x] **Arena Allocator**: Implemented in `lib/memory/arena_allocator.bpl`.
  - **Review**: The current implementation looks solid. It correctly uses `mmap` for pages and a bump pointer for individual allocations.
  - **Action**: Ensure all compiler phases (Parser, TypeChecker) take an `*ArenaAllocator` in their context.

### 2.2 Collections & Data Structures

We need specific structures to handle scoping and symbols.

- [x] **ScopeStack<T>**: A wrapper around `List<Map<string, T>>`.
  - **Usage**: Handling variable shadowing ` { local x; { local x; } }`.
  - **API**: `enterScope()`, `exitScope()`, `define(name, val)`, `lookup(name)`.
- [x] **Map<K,V>**: Existing `lib/map.bpl` is sufficient.
- [x] **Set<T>**: Implemented in `lib/set.bpl` (wraps `Map<T, bool>`).

### 2.3 Diagnostics & Error Reporting

We need to report errors with context, similar to the TypeScript implementation.

- [x] **Module: `std/diagnostics.bpl`**
  - **Status**: Implemented in `lib/diagnostics.bpl` and `examples/std_diagnostics`.
  - **Struct `Span`**: `{ file: string, start: int, end: int, line: int, col: int }`.
  - **Struct `Diagnostic`**: `{ level: Error|Warning, message: string, span: Span }`.
  - **Function `printDiagnostic(d)`**: Reads the source line and prints it with a caret/underline pointing to the error.

## 3. I/O and Filesystem

The current `fs` module reads entire files into strings. For a compiler, streaming is often preferred, but for BPL source files (usually < 1MB), reading the whole string is acceptable **if** we have a good abstractions for traversing it.

- [x] **Enhance `lib/fs.bpl`**:
  - **Status**: Added `readFile` (read-to-string), `writeFile`, `exists`.
  - Add `BufferedReader` or `FileStream` for larger reads if necessary.
  - **Decision**: For the first version, reading the full source into a `String` is acceptable, provided we wrap it in a `SourceFile` struct.
- [x] **Enhance `lib/path.bpl`**:
  - **Status**: Implemented and verified in `examples/stdlib_path`.
  - `resolve(base, relative)`: Handle `../`, `./` arithmetic.
  - `isAbsolute(path)`: Check for `/` root.
  - `normalize(path)`: Remove redundant slashes and dots.
  - **Requirement**: Essential for module resolution (`import ... from "./foo.bpl"`).

## 4. Lexing Strategy (Regex vs. Manual)

**Question**: Should we use C regex libs or manual checks?

**Decision**: **Manual Character Classification**.

- **Why?**
  - **Performance**: A switch-statement state machine is significantly faster than compiling and running a regex for every token.
  - **Dependencies**: Avoids linking complex C libraries (`libpcre` or `regex.h`).
  - **Control**: Easier to handle edge cases (nested comments, string interpolation).
- **Implementation**:
  - Create helper `std/char_utils.bpl`:
    - **Status**: Implemented in `lib/char_utils.bpl`.
    - `isDigit(c)`, `isAlpha(c)`, `isWhitespace(c)`.
    - `isHex(c)`, `toLower(c)`.

## 5. Runtime Independence (Syscalls)

Currently, we rely on `libc` (`printf`, `malloc`, `fopen`).
**Plan**:

1.  **Short-term**: Continue using `libc` via `extern` to speed up compiler logic development.
2.  **Mid-term**: Wrap `libc` calls in `std` wrappers so the compiler code doesn't "know" it's using C.
3.  **Long-term**: Replace `std` implementations with `lib/sys/linux/*.s` (ASM syscalls) as defined in the native runtime plan.

## 6. Implementation Checklist

### Phase 1: Foundation (Current)

- [x] `ArenaAllocator` (`lib/memory/arena_allocator.bpl`)
- [x] `CLI ArgParser` (`lib/arg_parser.bpl`)
- [x] Implement `ScopeStack<T>`
- [x] Implement `std/diagnostics` (`lib/diagnostics.bpl`)
- [x] Implement `Set<T>` (`lib/set.bpl`)
- [x] Implement `Path` utilities (`lib/path.bpl`)
- [x] Implement `FS` utilities (`lib/fs.bpl`)

### Phase 2: Compiler Frontend

- [x] **SourceReader**: Struct to track `line`, `col`, and `index` while consuming chars (`src/source_reader.bpl`).
- [x] **Lexer**: Convert `GrammarLexer.ts` logic to BPL using `SourceReader` and manual char checks (`src/scanner.bpl`).
- [x] **AST Defs**: Define `enum NodeKind` and `struct Node` hierarchy in BPL (`src/ast.bpl`).
- [x] **Symbol Table**: Define `Symbol`, `SymbolKind` and `SymbolTable` (`src/symbols.bpl`).
- [x] **Semantic Types**: Define `Type` and `TypeKind` (`src/types.bpl`).
- [ ] **Parser**: Recursive descent parser building AST nodes in the Arena (to be implemented in `src/parser.bpl`).

### Phase 3: Middle & Backend

- [ ] **TypeChecker**: Walk the AST, resolve symbols using `ScopeStack`.
- [ ] **IRGen**: Walk the AST, print LLVM IR string to a buffer.
- [ ] **Driver**: Connect ArgParser -> Reader -> Lexer -> Parser -> IRGen -> File Write.

## 7. Notes on "ArenaAllocator.bpl"

The provided implementation is **good**.

- It correctly handles `mmap` with `MAP_PRIVATE | MAP_ANONYMOUS`.
- It implements the `init`, `alloc`, `reset` lifecycle needed for compiler passes.
- **Micro-optimization**: Large allocations (`> default_block_size`) now bypass the current block and are allocated as dedicated blocks to prevent fragmentation.
