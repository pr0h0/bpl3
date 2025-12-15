# BPL3 Compiler Progress

- Number inside brackets indicates priority (lower number = higher priority), x indicates completed features.

## Completed Features

- [x] Strict Type Compatibility Checking
- [x] Inheritance Support (Structs)
- [x] Generics Parsing Fix (`>>` operator)
- [x] Control Flow Analysis (Missing Return Check)
- [x] Declaration Hoisting (Two-pass compilation)
- [x] Array Indexing Type Resolution
- [x] Method `this` Support
- [x] Module System (Imports)
- [x] Nested Generics & Static Methods
- [x] Generic Instantiation in Expressions
- [x] Make `this` explicit in struct methods
- [x] Code Generation (LLVM IR or similar)
- [x] Canonical primitive integer types mapping
- [x] Type casting (implicit & explicit)
- [x] CLI compiler tool
- [x] Unit & integration tests (basic coverage exists)
- [x] Try/catch error handling (already implemented)
- [x] Type Aliasing (user-defined type aliases)
- [x] Project structure & LLVM upgrade
- [x] Full import resolution before compilation
- [x] Per-module compilation and linking with cache
- [x] Replace lli with clang for running LLVM IR
- [x] Add default exit code for main if it's void
- [x] Packaging system for libraries/apps (init, pack, install, list commands)
- [x] Constructors and destructors for structs
- [x] Monomorphization for Generic Structs (Basic Support)
- [x] Code formatter
- [x] Error handling and diagnostics
- [x] AST/IR printing flags (CLI `--emit` option)
- [x] Language Specification Update
- [x] VS Code Extension
- [x] Language Server Protocol (LSP) Implementation
- [x] Robust Import/Export & Linking
- [x] Function Overloading by Parameter Types

## Pending Features (expanded)

- [3] Standard Library Module

  - Description: Build a comprehensive standard library as an importable module providing data structures (lists, maps, sets), algorithms, string utilities, and math helpers.
  - Implementation notes: Start with small, critical modules (strings, arrays, io). Provide both high-level BPL implementations and low-level runtime helpers backed by `lib/` for performance-critical functions.
  - Acceptance criteria: Example programs can `import std` and use library features; library code compiles and links with generated code.

- [9] Semantic Analysis Improvements

  - Description: Enhance the TypeChecker and semantic analysis to catch more errors at compile time, such as unreachable code, variable shadowing, and unused variables.
  - Implementation notes: Add passes for control flow analysis (reachability) and scope analysis (shadowing).
  - Acceptance criteria: Compiler warns or errors on unreachable code and shadowed variables.

- [4] Advanced Generics (Constraints, Inference)

  - Description: Add generic constraints (e.g., `T: Comparable`) and local inference so generic functions can deduce type parameters from call-sites where possible.
  - Implementation notes: Extend type parameter structures to include bounds; implement constraint checking during type inference/resolution. Add unification and constraint propagation algorithm to TypeChecker.
  - Acceptance criteria: Constrained generics accept only types satisfying bounds; generic functions without explicit type args can be called with types that infer correctly.

- [4] Operator Overloading for User Types

  - Description: Let user-defined types implement special methods (dunder-style like `__add__`, `__eq__`) that override built-in operator behavior for instances.
  - Implementation notes: Define mapping between operators and method names; during type-checking, if an operand type has the corresponding method, resolve to that method; otherwise fall back to builtin semantics. Disallow assignment operators overloading. Ensure overload resolution supports left/right operand dispatch and coercions.
  - Acceptance criteria: Defining `__add__` on a struct causes `a + b` to call that method; operator resolution respects type conversions and produces helpful errors when ambiguous.

- [5] Root Global `Type` Struct

  - Description: Define a root `Type` struct that every user-defined struct implicitly inherits from, providing methods like `getTypeName()`, `getSize()`, `toString()`, and basic equality.
  - Implementation notes: Add injection of implicit base for every struct during parsing/semantic analysis. Implement common methods as part of the runtime/stdlib. Ensure virtual dispatch works (method overriding) if language supports it.
  - Acceptance criteria: Any struct can call `getTypeName()`; common operations are available without explicit inheritance in source.

- [5] Primitive Types as Structs Inheriting `Primitive`

  - Description: Model primitive types (int, float, bool, char) as structs inheriting from a `Primitive` base, exposing operations as methods to unify the type system.
  - Implementation notes: Represent primitives specially in the type system but provide method dispatch wrappers so code like `int_val.toString()` is valid. Balance performance (inlined primitives) with uniformity (object-like methods).
  - Acceptance criteria: Primitive methods are callable and interoperate with language operators; performance-sensitive paths remain efficient.

- [5] Multi-Target Support

  - Description: Add support for targeting multiple platforms and architectures (x86/x64/ARM) and provide conditional std lib methods for platform differences.
  - Implementation notes: Abstract target-specific codegen paths and provide a target triple input. Maintain a small set of runtime abstractions for syscalls/ABI.
  - Acceptance criteria: Codegen can emit different target outputs and small example programs run on at least two targets.

- [6] Type Narrowing / Pattern Matching

  - Description: Implement syntax and semantics for narrowing variable types based on runtime checks (useful inside `catch` blocks or generic contexts).
  - Implementation notes: Add a `match<T>(expr)` AST construct and TypeChecker rules to narrow variable types inside block scope. Ensure RTTI support for runtime checks.
  - Acceptance criteria: Within a `match<T>(v)` block, `v` has type `T` and member accesses/overloads resolve accordingly.

- [6] Linting Tool

  - Description: Provide static analysis tooling to detect style and potential bugs (unused vars, suspicious casts, missing returns.)
  - Implementation notes: Reuse AST and TypeChecker. Make rules configurable and add autofix for simple cases.
  - Acceptance criteria: Linter runs and reports actionable warnings; some autofixes available.

- [6] Documentation Generation Tool

  - Description: Tool to parse source comments and generate API docs (HTML/Markdown) for language, libraries, and runtime.
  - Implementation notes: Reuse the parser/AST to extract doc comments and signatures. Provide templates and command-line options for output formats. Consider output used by IDE tooltips. Similar to JSDoc/Doxygen.
  - Acceptance criteria: Running the doc tool outputs a readable API doc set for the std lib and sample modules.

- [7] Allow Structs to Inherit Primitives

  - Description: Permit `struct MyInt : int { ... }` so a struct can behave as a primitive type with additional methods/fields.
  - Implementation notes: Carefully design memory layout and type compatibility: instances of `MyInt` must be usable where `int` is expected. Implement implicit conversion rules and method overriding semantics. Consider specialization in codegen for performance.
  - Acceptance criteria: `MyInt` instances can be passed to APIs expecting `int`; overrides of primitive methods are callable.

- [9] Const Correctness

  - Description: Enforce `const` (or equivalent) declarations and immutability rules across the language: constant variables, read-only fields, `const` parameters, and compile-time constants. Ensure the compiler prevents mutation of `const` values and accepts usage patterns that are safe.
  - Implementation notes: Add `isConst` flag to symbol/type entries. Propagate const through assignments, parameter passing, and returns. Treat `const` references to mutable objects as shallowly const unless a deeper const model is chosen. Decide whether `const` applies to variables, fields, and/or function returns.
  - Acceptance criteria: Examples declaring `const` variables produce errors on mutation; `const` parameters cannot be assigned inside functions; `const` globals evaluate as compile-time constants where used.

- [9] Async/Await

  - Description: Add `async` functions and `await` operator with promise-like semantics to simplify asynchronous programming.
  - Implementation notes: Decide whether to transpile async into callback-based state machines or use runtime coroutines. Provide runtime for futures/promises and event loop integration.
  - Acceptance criteria: `async` functions return a `Future`/`Promise` type and `await` suspends/resumes correctly in examples.

- [9] Threading Support

  - Description: Provide language primitives to create and manage threads, synchronization primitives, and safe concurrency patterns.
  - Implementation notes: Integrate with target threading primitives (pthreads on POSIX). Define memory model and synchronization primitives (mutex, atomic ops).
  - Acceptance criteria: Spawn, join threads, and synchronized access examples behave correctly.

- [9] Inline Assembly Blocks
  - Description: Allow embedding inline assembly with explicit register lists and integration with calling conventions.
  - Implementation notes: Add parser support and a safe lowered representation. During codegen, inject asm inline properly and validate register usage.
  - Acceptance criteria: `asm [rax, rbx] { rdrand rax\n mov rbx, rax\n mov (variable), rbx }` compiles and emits inline assembly; constraints are documented.
