# Pending Features

This document outlines the pending features for the BPL compiler, prioritized by their importance and complexity. Each item includes a description, implementation notes, and acceptance criteria.

Priority levels: 0 = Highest Priority, 9 = Lowest Priority

---

## 🎯 RECOMMENDED NEXT STEPS

The following features are recommended for implementation next:

### 1. **Watch Mode** [Priority 5] ⏱️ DX

- **Why:** Improves developer feedback loop
- **Impact:** Faster iteration during development
- **Use cases:** Active development
- **Complexity:** Medium

---

## 📋 COMPLETED FEATURES

## [8] ✅ Inline Assembly Blocks (COMPLETED)

**Description:** Allow embedding inline assembly with explicit register lists and integration with calling conventions.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Syntax**: Extended interpolation syntax `(var)`, `(=var)`, `(var: "constraint")`.
- ✅ **Codegen**: Updated `StatementGenerator` to parse extended syntax and generate correct LLVM inline asm calls with constraints.
- ✅ **Constraints**: Supported explicit input/output constraints and clobber lists.
- ✅ **Tests**: Added `examples/asm_test` verifying inputs, outputs, and clobbers.

## [3] ✅ Defer Statement (COMPLETED)

**Description:** Implement `defer` for guaranteed execution of cleanup code when scope exits.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Grammar**: Added `defer` keyword and statement parsing.
- ✅ **AST**: Added `DeferStmt` node.
- ✅ **Checker**: Enforced `void` return type for deferred blocks.
- ✅ **Codegen**: Implemented LIFO execution using `LambdaCall` and `FreeCaptureStruct` to handle recursion safely.
- ✅ **Tests**: Added `examples/defer_test` and `examples/defer_edge_cases`.

## [3] ✅ C-style For Loop Support (COMPLETED)

**Description:** Support for C-style for loops `loop(init; cond; step) { ... }`.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Grammar**: Updated `bpl.peggy` to support `loop (init; cond; step)`.
- ✅ **AST**: Updated `LoopStmt` to include `init` and `step`.
- ✅ **Checker**: Updated `StatementChecker` to handle scope and type checking for init/step.
- ✅ **Codegen**: Updated `StatementGenerator` to generate correct LLVM IR including `continue` jumping to step.
- ✅ **Formatter**: Updated `Formatter` to format C-style loops.
- ✅ **Tests**: Added `examples/c_style_loop` verifying execution and `continue` behavior.

## [2] ✅ Scope Verification & Validation (COMPLETED)

**Description:** Verify and document variable scoping rules.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Verification**: Verified block scoping and shadowing with `examples/scope_block_shadowing`.
- ✅ **Documentation**: Updated `LANGUAGE_SPEC.md` with formal scoping rules.

## [3] ✅ Implicit Constructor Calls (COMPLETED)

**Description:** Automatically call `X.new(this)` when declaring `local x: X;`.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Verification**: Verified existing implementation with `examples/implicit_ctor`.

## [1] ✅ Parser Optimization (COMPLETED)

**Description:** Optimize the Peggy parser to reduce compilation time for large files (e.g., 5000+ functions) by minimizing object allocation during AST construction.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Location Handling**: Removed `normalizeLoc` overhead and optimized `mergeLoc` to avoid intermediate object creation.
- ✅ **AST Construction**: Updated `IfStatement` and other rules to use optimized location helpers.
- ✅ **Performance**: Reduced parsing time for massive files from ~8s to ~4s (best case).
- ✅ **Verification**: Verified with `tests/Integration.test.ts` and specific location tests.

## [2] ✅ Parser Error Recovery (COMPLETED)

**Description:** Implement robust error recovery in the parser to report multiple syntax errors in a single pass instead of crashing on the first one.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Grammar**: Added `ErrorRecovery` and `TopLevelErrorRecovery` rules to `bpl.peggy` using panic-mode recovery (synchronizing on `;` or `}`).
- ✅ **Parser**: Updated `PeggyParser.ts` to collect errors in an array and attach them to the AST instead of throwing immediately.
- ✅ **Driver**: Updated `Compiler` driver to handle `collectAllErrors` option.
- ✅ **Formatter**: Fixed formatter to throw `CompilerError` on invalid ASTs instead of crashing or producing garbage.
- ✅ **Tests**: Added `tests/ParserRecovery.test.ts` and verified with fuzzing (10k iterations with 0 crashes).

---

## [6] ✅ Internal Error Structs (COMPLETED)

**Description:** Replace integer error codes with standard library structs for better error handling and debugging.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Standard Library**: Created `lib/errors.bpl` with `OptionUnwrapError`, `ResultUnwrapError`, `IOError`, `CastError`.
- ✅ **Option/Result**: Updated `Option.unwrap` and `Result.unwrapErr` to throw structured errors.
- ✅ **Filesystem**: Updated `FS.readFile` to throw `IOError`.
- ✅ **Compiler Support**: `IndexOutOfBoundsError`, `NullAccessError`, `DivisionByZeroError` were already supported in codegen.
- ✅ **Tests**: Added `examples/internal_error_structs` to verify structured error throwing and catching.

---

## [3] ✅ Sizeof Operator Improvements (COMPLETED)

**Description:** Support generic syntax `sizeof<T>()` and function-call syntax `sizeof(expr)` or `sizeof(T)`.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Grammar**: Updated `bpl.peggy` to accept `sizeof(Expression | Type)`.
- ✅ **AST**: Updated `SizeofExpr` to support `Expression` or `TypeNode` targets.
- ✅ **Formatter**: Updated `Formatter.ts` to preserve `sizeof<T>()` vs `sizeof(expr)` style.
- ✅ **Checker**: Updated `ExpressionChecker` to handle `LambdaType` and `MetaType` targets.
- ✅ **Codegen**: Updated `ExpressionGenerator` to resolve types for expression targets.
- ✅ **Tests**: Added `tests/Sizeof.test.ts` covering all cases.

---

## [3] ✅ Homogeneous Variadic Functions (COMPLETED)

**Description:** Support for typed variadic functions (e.g., `...args: int`) alongside heterogeneous `...Any`.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Type Checker**: Enforced strict structure `frame foo(...args: T, count: int)`.
- ✅ **Overload Resolver**: Updated to handle typed variadics correctly.
- ✅ **Tests**: Added `examples/variadic_homogeneous` and `tests/Variadic.test.ts`.

---

## [3] ✅ Type Narrowing / Pattern Matching (COMPLETED)

**Description:** Allows safer code by narrowing types in conditional blocks and explicit casting.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **`is` Operator**: Runtime type checking (e.g., `if (x is int)`).
- ✅ **`as` Operator**: Explicit type casting (e.g., `local y = x as float`).
- ✅ **Struct Upcasting**: Support for casting child structs to parent structs (e.g., `Dog` as `Animal`).
- ✅ **Chained Casts**: Correct parsing and formatting for chained casts (e.g., `x as int as float`).
- ✅ **Formatter**: Enforced parentheses for `as`/`is` expressions to ensure correct precedence.
- ✅ **Tests**: Comprehensive test suite covering primitives, structs, inheritance, specs, and enums.

**Tests:**

- `tests/TypeNarrowing.test.ts`: Consolidated test suite for all type narrowing features.
- `examples/type_narrowing/`: Integration example demonstrating usage.

---

## [3] ✅ Result<T, E> Implementation (COMPLETED)

**Description:** Implement the `Result<T, E>` type in the standard library for robust error handling, along with necessary compiler support for generic enum operator overloading.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Standard Library**: Added `lib/result.bpl` with `Result<T, E>` enum and methods (`unwrap`, `map`, etc.).
- ✅ **Backend Support**: Updated `ExpressionGenerator` to support operator overloading on Generic Enums.
- ✅ **Operator Overloading**: Implemented `==` and `!=` for `Result` and updated `Option` to use pointer receivers for efficiency.
- ✅ **Type Checker**: Fixed match arm unification for diverging types (e.g., `throw`).
- ✅ **CLI Improvements**: Fixed error display for `--eval` mode.

**Tests:**

- `examples/result_test/`: Verification of `Result` functionality.
- `examples/stdlib_unified/`: Integration test for standard library types.
- `tests/Integration.test.ts`: Verified no regressions in existing tests.

---

## [5] ✅ Const Correctness (COMPLETED)

**Description:** Enforce `const` (or equivalent) declarations and immutability rules across the language: constant variables, read-only fields, `const` parameters, and compile-time constants.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Const Keyword**: Added `const` keyword for local variables (`local const x: int = 10;`) and function parameters (`frame foo(x: const int)`).
- ✅ **Type System**: Updated `TypeChecker` to track `isConst` property on symbols and types.
- ✅ **Immutability Enforcement**:
  - Prevent assignment to `const` variables and parameters.
  - Prevent assignment to fields of `const` structs.
  - Prevent assignment to elements of `const` arrays.
  - Recursive const checking for nested access (e.g., `constStruct.field.subfield = 1` is illegal).

---

## [4] ✅ Documentation Generator (COMPLETED)

**Description:** A tool to generate Markdown documentation from source code comments.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Syntax Change**: Changed multi-line comments to `/# ... #/` to avoid conflict with Markdown headers (`###`).
- ✅ **Parser**: Updated grammar and lexer to support new comment syntax.
- ✅ **Generator**: Implemented `DocumentationGenerator` to parse comments and generate Markdown.
- ✅ **CLI**: Added `docs` command to the CLI.
- ✅ **Standard Library**: Updated all standard library files with proper documentation comments.

---

- ✅ **Lambda Support**: `const` correctness for captured variables and lambda parameters.
- ✅ **Formatter**: Updated formatter to handle `const` syntax correctly.
- ✅ **Tests**: Added comprehensive unit and integration tests covering all scenarios.

**Tests:**

- `tests/ConstCorrectness.test.ts`: Unit tests for parser and type checker.
- `examples/const_correctness/`: Integration tests for runtime behavior and compilation errors.
- `examples/const_test/`: Additional regression tests.

---

## [4] ✅ VS Code Extension Improvements (COMPLETED)

**Description:** Enhanced the VS Code extension with better standard library resolution, new language features support, and productivity tools.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **BPL_HOME Support**: Fixed standard library resolution to respect `BPL_HOME` environment variable and added `bplLanguageServer.bplHome` setting.
- ✅ **New Language Features**: Added support for `enum`, `u8`-`u64`, `Option`, `Result` in autocomplete and hover.
- ✅ **Snippets**: Added a comprehensive set of code snippets for common patterns (main, frame, struct, enum, loops, etc.).
- ✅ **Syntax Highlighting**: Updated TextMate grammar to support new types (`u8`-`u64`).

## [4] ✅ Debugger Support (DWARF) (COMPLETED)

**Description:** Enables source-level debugging with GDB/LLDB by generating DWARF debug information in the LLVM IR.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **DWARF Metadata**: Added generation of `!DICompileUnit`, `!DISubprogram`, `!DILocalVariable`, `!DIGlobalVariable`, `!DIBasicType`, `!DICompositeType` metadata.
- ✅ **Source Mapping**: Attached `!dbg` locations to LLVM instructions to map IR back to source lines.
- ✅ **Variable Inspection**: Enabled inspection of local variables, global variables, and function arguments in GDB.
- ✅ **Struct Support**: Implemented debug info for struct types and member access.
- ✅ **Verification**: Verified with GDB on test cases involving locals, globals, and structs.

---

## [3] ✅ Multi-Target Support (COMPLETED)

**Description:** Add support for targeting multiple platforms and architectures (x86/x64/ARM) and provide conditional std lib methods for platform differences.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **CLI Support**: Added `--target`, `--sysroot`, `--cpu`, `--march` flags to `bpl` CLI
- ✅ **Backend Integration**: `CodeGenerator` now accepts a target triple and emits `target triple = "..."` directive in LLVM IR
- ✅ **Module Cache**: Cache keys now include the target triple to ensure correct caching for different targets
- ✅ **Linker**: Linker correctly forwards target flags to `clang`
- ✅ **Verification**: Verified with Windows (x86_64) and macOS (ARM64) targets

**Tests:**

- Verified that `bpl build --target x86_64-pc-windows-gnu` produces IR with `target triple = "x86_64-pc-windows-gnu"`
- Verified that `bpl build --target arm64-apple-darwin` produces IR with `target triple = "arm64-apple-darwin"`
- Verified that multi-module builds correctly propagate target settings

---

## [1] ✅ Enum Types and Pattern Matching (COMPLETED)

**Description:** Implement enum types (including tagged unions with associated data) with exhaustive pattern matching support. This enables type-safe state representation and powerful control flow based on data variants.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ Enum declaration with unit, tuple, and struct variants
- ✅ Generic enums
- ✅ Match expressions with exhaustiveness checking
- ✅ Pattern guards (`if` conditions in match arms)
- ✅ Enum methods and equality operators
- ✅ Recursive enums (via pointers)
- ✅ LLVM IR generation for tagged unions
- ✅ Explicit returns in match arms (blocks returning values)

---

## [2] ✅ Generic-Aware Operator Resolution (COMPLETED)

**Description:** Enable operator overloading to work with generic types by making operator resolution happen after generic type substitution. Generic structs like `Array<T>`, `Stack<T>`, `Queue<T>`, etc. can now use operator overloading with full type parameter substitution support.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ TypeChecker enhancement: Generic type substitution for operator methods
- ✅ CodeGenerator enhancement: Correct monomorphized method name generation
- ✅ Fixed nested generic type resolution (e.g., `Array<Pair<K,V>>`)
- ✅ All stdlib generic types updated with operators:
  - Array<T>: `<<` (push), `>>` (pop)
  - Stack<T>: `<<` (push)
  - Queue<T>: `<<` (enqueue)
  - Map<K,V>: `==`, `!=`
  - Set<T>: `|` (union), `&` (intersection), `-` (difference), `==`, `!=`
  - Option<T>: `==`, `!=`
  - Result<T,E>: `==`, `!=`
  - Vec2/Vec3: Full arithmetic operators

**Examples:**

- `examples/operator_overloading_generic/` - Generic operator overloading tests
- `examples/operator_overloading_minimal/` - Minimal generic test
- `examples/operator_overloading_simple/` - Multiple operators and types
- `examples/stdlib_operator_overloading/` - Comprehensive stdlib operators test

**Tests:**

- All 139 integration tests passing
- Operators work correctly with concrete generic instantiations
- Nested generics properly resolved

**Documentation:**

- `docs/generic-operator-implementation-complete.md` - Implementation details
- `docs/STDLIB_OPERATORS.md` - Complete operator reference for stdlib

---

## [1] ✅ Operator Overloading for User Types (COMPLETED)

**What Was Implemented:**

- ✅ Comprehensive mapping of 24 operators to dunder methods (`__add__`, `__sub__`, `__mul__`, `__div__`, `__mod__`, `__and__`, `__or__`, `__xor__`, `__lshift__`, `__rshift__`, `__eq__`, `__ne__`, `__lt__`, `__gt__`, `__le__`, `__ge__`, `__neg__`, `__not__`, `__pos__`, `__get__`, `__set__`, `__call__`)
- ✅ TypeChecker phase: Detects operator usage and annotates AST with operator overload metadata
- ✅ CodeGenerator phase: Transpiles operators to method calls for overloaded operators
- ✅ Support for binary operators (+, -, \*, /, %, &, |, ^, <<, >>)
- ✅ Support for comparison operators (==, !=, <, >, <=, >=)
- ✅ Support for unary operators (-, ~, +) - prefix only
- ✅ Support for indexing operator ([] via `__get__` and `__set__`)
- ✅ Support for call operator (() via `__call__`)
- ✅ Proper error messages for missing or invalid operator overloads
- ✅ Assignment operators remain non-overloadable (compound assignments use read + operator + write)

**Examples:**

- `examples/operator_overloading/` - Basic operators (Vector2D, Complex, Callable)
- `examples/operator_overloading_arithmetic/` - Division, modulo (Rational, ModInt)
- `examples/operator_overloading_bitwise/` - Bitwise and comparison operators (BitSet, Integer)

**Tests:**

- 14 unit tests in `tests/OperatorOverloading.test.ts`
- 5 error test cases in `examples/errors/operator_overloading_errors/`
- All integration tests passing

---

## [3] ✅ Root Global `Type` Struct (COMPLETED)

**Description:** Define a root `Type` struct that every user-defined struct implicitly inherits from, providing methods like `getTypeName()`, `getSize()`, `toString()`, and basic equality. This creates a unified type hierarchy where all objects share common capabilities, enabling polymorphic code that works with any type and providing runtime type information.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ `Type` struct in `std` module
- ✅ Implicit inheritance: All user structs inherit from `Type`
- ✅ Virtual method dispatch for `toString()`, `equals()`, `hashCode()`
- ✅ Runtime Type Information (RTTI) basics
- ✅ Cross-module method resolution for inherited methods

**Acceptance Criteria:**

- Any struct can call `getTypeName()` and receive the correct type name
- Common operations are available without explicit inheritance in source code
- Type metadata is available at runtime for introspection
- Objects maintain proper polymorphic behavior through the type hierarchy
- Methods can be overridden to customize behavior

---

## [3] ✅ Primitive Types as Structs (COMPLETED)

**Description:** Model primitive types (int, float, bool, char) as structs inheriting from a `Primitive` base, exposing operations as methods to unify the type system. This eliminates the distinction between primitive and user-defined types, allowing primitives to have methods and follow the same protocols as user types while maintaining performance through specialized handling.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ Wrapper structs `Int`, `Bool`, `Double` in `std` module
- ✅ Compiler mapping from primitive types (`i32`, `i1`, `f64`) to wrapper structs
- ✅ Method calls on primitive variables and literals (e.g., `42.toString()`)
- ✅ `CallChecker` logic to resolve primitive members to wrapper struct members
- ✅ `CodeGenerator` support for primitive member access

**Acceptance Criteria:**

- Primitive methods are callable on variables and literals
- Primitive methods interoperate correctly with language operators
- Code like `(42).toString()` and `3.14.abs()` compiles and runs correctly
- Performance-sensitive paths maintain efficiency through compiler optimizations
- Primitives follow the same method resolution rules as user-defined types

---

## [4] ✅ Closures and Lambda Expressions (COMPLETED)

**Description:** Implement anonymous functions with automatic capture of local variables from enclosing scope. This enables functional programming patterns, callback-based APIs, and higher-order functions while maintaining type safety and memory safety.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ Lambda syntax: `|x: int, y: int| -> int { return x + y; }` and expression style `|x, y| x + y`
- ✅ Capture by Value: Variables from enclosing scope are captured by value (copy)
- ✅ Closure Struct Generation: Compiler automatically generates structs to hold captured state
- ✅ `Func<Ret>(Args...)` Type: Unified function pointer and closure type
- ✅ VS Code Support: Syntax highlighting and type information on hover
- ✅ Integration with Standard Library: Used in `List.map`, `List.filter` etc.
- ✅ Integration with Enum Pattern Matching: Capturing variables bound in match patterns

**Examples:**

- `examples/lambda_capture_test/` - Verification of capture semantics
- `examples/lambda_simple/` - Basic usage
- `examples/functional_patterns/` - Map/Filter/Reduce examples
- `examples/lambda_enum_match/` - Integration with Enum Pattern Matching

**Documentation:**

- `docs/53-lambdas.md` - Comprehensive guide on syntax and capture rules

---

## [5] ✅ Linting Tool (COMPLETED)

**Description:** Provide static analysis tooling to detect style issues, potential bugs, and code quality problems (unused variables, suspicious casts, missing returns, unreachable code). This helps developers maintain code quality and catch bugs early without running the program.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **CLI Command**: `bpl lint <files...>`
- ✅ **Linter Engine**: Extensible rule-based linter
- ✅ **Rules**:
  - Unused variables and parameters
  - Naming conventions (PascalCase structs, camelCase functions)
  - Unreachable code detection
  - Shadowing detection
- ✅ **Integration**: Integrated with compiler diagnostics

**Acceptance Criteria:**

- Linter runs successfully on projects
- Reports actionable warnings with clear messages and locations
- Rules are configurable per-project
- Output integrates well with IDE and build tools

---

## [6] Allow Structs to Inherit Primitives ✅ (COMPLETED)

**Description:** Permit `struct MyInt : int { ... }` so a struct can behave as a primitive type with additional methods/fields. This enables creating specialized primitive types with domain-specific methods while maintaining compatibility with code expecting the base primitive type.

**Implementation Notes:**

- ✅ Carefully design memory layout to ensure compatibility with base primitive (`__base__` field)
- ✅ Implement type compatibility rules: instances of `MyInt` must be usable where `int` is expected
- ✅ Implement implicit conversion rules (MyInt -> int when needed)
- ✅ Handle method overriding semantics for primitive methods
- ✅ Consider specialization in codegen for performance
- ✅ Generate efficient code that doesn't add overhead for the wrapper struct
- ✅ Support field additions on top of primitive base
- ✅ Handle constructors and conversions properly

**Acceptance Criteria:**

- ✅ `MyInt` instances can be passed to APIs expecting `int`
- ✅ Struct can add methods to the primitive type
- ✅ Memory layout is compatible with base primitive type
- ✅ Overrides of primitive methods are callable
- ✅ Performance remains acceptable (no unnecessary boxing/unboxing)

---

## [5] ✅ Language Server Protocol (LSP) Enhancements (COMPLETED)

**Description:** Expand the capabilities of the BPL Language Server to support advanced features like "Rename Symbol", "Find All References", "Go to Implementation", and "Code Actions". This significantly improves the developer experience in editors like VS Code.

**Implementation Status:** ✅ Fully Implemented (December 2025)

**What Was Implemented:**

- ✅ **Rename Symbol**: Implemented `textDocument/rename` to rename symbols across open files.
- ✅ **Find References**: Implemented `textDocument/references` to find symbol usages.
- ✅ **Go to Implementation**: Implemented `textDocument/implementation` to find structs implementing a spec.
- ✅ **Code Actions**: Added "Quick Fix" to auto-import common standard library types (`Result`, `Option`, `List`, etc.) when they are unknown.
- ✅ **Snippets**: Expanded snippet library with `match`, `spec`, `lambda`, `const`, and more.

---

## [6] String Interpolation ✅ (COMPLETED)

**Description:** Support embedding expressions directly into string literals using `${expression}` syntax. This simplifies string construction and improves readability compared to concatenation or `printf` formatting.

**Implementation Notes:**

- ✅ Update lexer/parser to handle interpolated strings (e.g., `$"Value: ${x}"`)
- ✅ Desugar interpolation into string concatenation or `StringBuilder` calls
- ✅ Support arbitrary expressions inside `${...}`
- ✅ Handle escaping of `$` characters

**Acceptance Criteria:**

- ✅ `local s: string = $"Hello ${name}!";` compiles and works
- ✅ Expressions inside `${}` are evaluated correctly
- ✅ Works with complex expressions (e.g., `${a + b}`)

---

## [7] ✅ Fuzz Testing Integration (COMPLETED)

**Description:** Integrate fuzz testing (e.g., LLVM libFuzzer) to automatically generate random inputs and find compiler crashes or assertion failures. This improves the robustness of the compiler.

**Implementation Notes:**

- Create a fuzz target that invokes the compiler frontend (lexer/parser/typechecker)
- Link with libFuzzer
- Run fuzzer continuously in CI or on dedicated machines
- Triage and fix discovered crashes

**Acceptance Criteria:**

- Fuzz target exists and can be run
- Fuzzer finds known crashes (if any)
- Compiler robustness improves over time

---

## [7] ✅ Compiler Performance Benchmarking (COMPLETED)

**Description:** Establish a benchmarking infrastructure to track compiler performance (build time, memory usage) over time and prevent regressions.

**Implementation Notes:**

- Create a set of benchmark projects (small, medium, large)
- Write scripts to measure compilation time and peak memory usage
- Integrate with CI to run benchmarks on every commit or nightly
- Visualize results to identify trends

**Acceptance Criteria:**

- Benchmarks run automatically
- Performance regressions are flagged
- Historical performance data is available

---

## [9] ✅ Source Code Display for Eval/Stdin Errors (COMPLETED)

**Description:** Fix error message code snippets when compiling from stdin (`--stdin`) or eval mode (`-e`). Currently, when an error occurs in code compiled from these sources, the error formatter attempts to read the source from a file that doesn't exist or accidentally reads binary data from compiled executables with similar names (e.g., `stdin-42069`), resulting in garbled output.

**The Problem:**

When using `--stdin` or `-e`, the compiler assigns fake file paths like `stdin-42069` or `eval-42069` to track the source. However, the `CompilerError` class tries to read these as real files to display code snippets. This causes:

1. Binary data display when a compiled executable with that name exists
2. Empty/missing code snippets when no file exists
3. Poor user experience for interactive/piped compilation

**Implementation Notes:**

There are several approaches to fix this:

**Option 1: Thread source through CompilerError (Preferred)**

- Modify `CompilerError` constructor to accept optional `sourceLines: string[]` parameter
- When compiling from stdin/eval, capture the source and pass it to error constructors
- Store source in a global context or thread it through the compilation pipeline
- Modify all places that create `CompilerError` to optionally provide source

**Option 2: Source cache by file path**

- Create a global `SourceCache` that maps file paths to source content
- When compiling stdin/eval, register the source in the cache with the fake path
- Modify `CompilerError.loadSourceLines()` to check the cache before reading from disk
- Clear cache after compilation to avoid memory leaks

**Option 3: Virtual file system**

- Create an abstraction layer for file reading that supports "virtual" files
- Register stdin/eval sources as virtual files in this system
- Update all file reading throughout the compiler to use this abstraction

**Acceptance Criteria:**

- Errors from `bpl --stdin` display the actual source code line with proper highlighting
- Errors from `bpl -e "code"` show the code that was passed
- No binary data or garbled text appears in error messages
- Column indicators (^^^) correctly point to error locations
- Solution doesn't significantly complicate the codebase
- Memory usage remains reasonable (no unbounded caching)

## 🚧 PARTIALLY COMPLETED FEATURES

## [9] Semantic Analysis Improvements

**Description:** Enhance the TypeChecker and semantic analysis to catch more errors at compile time, such as unreachable code, variable shadowing, and unused variables. This improves code quality and helps developers catch bugs early in development.

**Implementation Notes:**

- Add control flow analysis passes for detecting unreachable code
- Implement scope analysis for detecting variable shadowing
- ✅ Add unused variable/parameter detection
- Detect unused function definitions
- Implement type consistency checking across code paths
- Add missing initialization detection
- Implement exhaustiveness checking for pattern matching
- Add warnings for suspicious type conversions
- Create configurable warning levels

**Acceptance Criteria:**

- Compiler warns or errors on unreachable code
- Shadowed variables are detected and reported
- ✅ Unused variables and functions are flagged
- Clear messages guide developers to issues
- Warnings can be individually configured or suppressed

---

## ⏳ PENDING FEATURES (PRIORITIZED)

### High Priority

## [5] Watch Mode

**Description:** Add a `--watch` mode to the CLI that monitors source files for changes and automatically recompiles affected modules. This improves the developer feedback loop.

**Implementation Notes:**

- Use file system watcher (e.g., `chokidar` or native APIs)
- Integrate with incremental compilation system
- Debounce change events to avoid redundant builds
- Clear terminal and show status updates

**Acceptance Criteria:**

- `bpl build --watch` stays running and waits for changes
- Modifying a file triggers a rebuild
- Only affected modules are recompiled

---

## [6] Default and Named Arguments

**Description:** Allow functions to define default values for parameters and allow callers to specify arguments by name. This reduces the need for function overloading and makes API calls more readable.

**Implementation Notes:**

- Update function declaration syntax to support default values (`x: int = 0`)
- Update call syntax to support named arguments (`foo(y=20, x=10)`)
- Resolve default values at call site (or generate wrapper functions)
- Handle mix of positional and named arguments
- Ensure correct evaluation order

**Acceptance Criteria:**

- Can declare functions with default parameters
- Can call functions omitting default parameters
- Can call functions using named arguments
- Named arguments can be in any order

---

## [6] Parser Error Recovery

**Description:** Improve the parser to recover from syntax errors and continue parsing the rest of the file. This allows reporting multiple errors in a single pass, rather than stopping at the first one.

**Implementation Notes:**

- Implement synchronization points (e.g., semicolons, braces)
- When an error occurs, skip tokens until a synchronization point is found
- Insert missing tokens or delete unexpected ones to restore valid state
- Mark AST nodes as "error" nodes to prevent cascading errors in later phases

**Acceptance Criteria:**

- Compiler reports multiple syntax errors in a single file
- Parser doesn't crash on malformed input
- IDE experience is improved (syntax highlighting doesn't break completely)

---

## [6] Nested Pattern Matching

**Description:** Extend pattern matching to support nested patterns, allowing deep destructuring of complex data structures in a single match arm. This improves readability and expressiveness when working with nested enums and structs.

**Implementation Notes:**

- Update parser to accept nested patterns (e.g., `Option.Some(Result.Ok(x))`)
- Update TypeChecker to validate nested patterns and bind variables correctly
- Update CodeGenerator to emit nested checks and extractions
- Ensure exhaustiveness checking handles nested cases

**Acceptance Criteria:**

- Can match `Outer.A(Inner.B(x))`
- Can bind variables at different levels of nesting
- Exhaustiveness checking works for nested patterns

---

### Medium Priority

## [7] Standard Library: Structured Logging

**Description:** Implement a structured logging module in the standard library. This allows applications to emit logs with different severity levels (Info, Warn, Error, Debug) and structured data, which is essential for monitoring and debugging production applications.

**Implementation Notes:**

- **Log Levels:** Define enum `LogLevel { Debug, Info, Warn, Error }`
- **Logger Interface:** Create `Logger` trait/interface
- **Console Logger:** Implement default logger writing to stdout/stderr
- **Formatting:** Support custom log formats (text, JSON)
- **Configuration:** Allow setting global log level and output target
- **Macros/Functions:** Provide helper functions `log.info(...)`, `log.error(...)`

**Acceptance Criteria:**

- Can log messages with different levels
- Can configure minimum log level (e.g., only show Warn+)
- Can switch between text and JSON output
- Logs include timestamp and severity

---

## [7] Standard Library: CLI Argument Parser

**Description:** Add a robust command-line argument parsing module to the standard library. This simplifies the creation of CLI tools by handling flag parsing, option validation, subcommand dispatch, and help text generation.

**Implementation Notes:**

- **Declarative API:** Struct-based or builder-based API to define flags and options
- **Types:** Support bool flags, string/int options, and list arguments
- **Subcommands:** Support git-style subcommands (e.g., `bpl build`, `bpl run`)
- **Help Generation:** Automatically generate usage strings and help messages
- **Validation:** Enforce required arguments and type constraints

**Acceptance Criteria:**

- Can define a CLI with flags (`--verbose`), options (`--output file`), and positional args
- Can parse `argv` into a structured result
- Automatically generates `--help` output
- Handles subcommands correctly

---

## [7] Defer Statement

**Description:** Implement defer keyword for guaranteed execution of cleanup code when a scope exits. This simplifies resource management and ensures cleanup happens even with early returns or exceptions.

**Implementation Notes:**

- Add defer keyword and statement parsing
- Track deferred statements in scope stack during transpilation
- Inject deferred code at all exit points (return, break, normal exit)
- Execute deferred statements in reverse order (LIFO)
- Handle defer with exceptions and error propagation
- Support defer in all block scopes
- Generate proper cleanup even with multiple returns
- Implement defer in try blocks and other special contexts

**Acceptance Criteria:**

- Deferred statements execute when scope exits
- Multiple defer statements execute in reverse order
- Works correctly with early returns
- Works correctly with exceptions
- Examples demonstrate resource cleanup patterns
- Cleanup code runs reliably in all exit paths

---

## [7] Module Visibility and Access Control

**Description:** Add public/private visibility modifiers and module-level encapsulation to control API exposure. This enables proper abstraction boundaries and library design while hiding implementation details.

**Implementation Notes:**

- Add pub/private keywords to declarations
- Implement visibility checking in semantic analysis
- Support module-level exports (pub use)
- Handle re-exports and visibility composition
- Implement visibility for structs, functions, and fields
- Support internal visibility for same-module access
- Generate proper error messages for visibility violations
- Handle visibility in generic instantiation

**Acceptance Criteria:**

- Private items are not accessible from outside their module
- Public items are accessible as expected
- Field visibility is enforced
- Module exports properly control public API
- Clear error messages on visibility violations
- Examples demonstrate proper encapsulation patterns

---

## [7] Package Registry and Dependency Management

**Description:** Create a centralized package registry and enhance the package manager to support publishing, versioning, and dependency resolution. This makes it easier to share and consume BPL libraries.

**Implementation Notes:**

- Design package metadata format (enhanced `bpl-package.json`)
- Implement semantic versioning resolution
- Create a backend registry API (simple static file server or API)
- Add CLI commands: `bpl publish`, `bpl install <package>`
- Handle transitive dependencies and version conflicts

**Acceptance Criteria:**

- Can publish a package to the registry
- Can install a package and its dependencies
- Version constraints are respected
- `bpl_modules` structure handles dependencies correctly

---

## [7] WebAssembly (WASM) Target

**Description:** Add a compilation target for WebAssembly (WASM) to enable running BPL code in web browsers and other WASM runtimes.

**Implementation Notes:**

- Add `wasm32-unknown-unknown` or `wasm32-wasi` target triple support
- Handle WASM-specific ABI differences
- Map BPL primitives to WASM types
- Provide WASM-compatible standard library (or subset)
- Generate `.wasm` files via LLVM backend

**Acceptance Criteria:**

- Can compile BPL code to `.wasm`
- Generated WASM runs in a browser or Node.js
- Basic I/O works (via WASI or imports)

---

## [7] Automatic C Binding Generation (bindgen)

**Description:** Create a tool to automatically generate BPL `extern` declarations from C header files (`.h`). This significantly reduces the effort required to use existing C libraries.

**Implementation Notes:**

- Use `libclang` or a C parser to read header files
- Map C types to BPL types (int -> i32, char* -> *char, structs -> structs)
- Generate BPL source file with `extern` definitions and struct layouts
- Handle macros and typedefs where possible

**Acceptance Criteria:**

- Tool accepts a `.h` file and outputs a `.bpl` file
- Generated bindings compile and link correctly
- Can call functions from a standard C library (e.g., `curl`, `sqlite`) using generated bindings

---

## [7] Standard Library: Networking & HTTP

**Description:** Add networking capabilities to the standard library, including TCP/UDP sockets and a basic HTTP client. This enables building network-connected applications.

**Implementation Notes:**

- Implement `std.net.Socket` wrapping platform-specific socket APIs (BSD sockets/Winsock)
- Implement `std.net.http` client using sockets or `libcurl` bindings
- Support blocking and non-blocking modes (integrate with Async/Await later)
- Provide DNS resolution helpers

**Acceptance Criteria:**

- Can create a TCP server and client
- Can make an HTTP GET request
- Basic error handling for network failures

---

## [7] Standard Library: System Calls & OS Interaction

**Description:** Expand the standard library to include essential system calls and OS interaction capabilities, such as signal handling, environment variable access, and process control.

**Implementation Notes:**

- Implement `std.os.signal` to handle signals like SIGINT, SIGTERM.
- Implement `std.os.env` for `getenv`, `setenv`.
- Implement `std.os.process` for `fork`, `exec`, `wait`, `pid`.
- Ensure cross-platform compatibility where possible (or clear errors on unsupported platforms).

**Acceptance Criteria:**

- Can register a signal handler and catch a signal.
- Can read and write environment variables.
- Can spawn a child process and wait for it to complete.

---

## [7] Standard Library: Date & Time

**Description:** Add a comprehensive Date and Time module to the standard library, supporting time retrieval, duration calculations, and formatting.

**Implementation Notes:**

- Implement `std.time.now()` to get current timestamp.
- Create `Date` and `Time` structs.
- Implement `Duration` for time intervals.
- Add formatting and parsing utilities (strftime style).
- Wrap platform-specific time functions (`clock_gettime`, `GetSystemTime`).

**Acceptance Criteria:**

- Can get the current system time with high precision.
- Can format a date string.
- Can measure the duration of an operation.

---

## [7] Standard Library: JSON & Serialization

**Description:** Add support for parsing and generating JSON data, a critical requirement for configuration and web APIs.

**Implementation Notes:**

- Implement `std.json.parse` returning a dynamic `JsonValue` enum variant.
- Implement `std.json.stringify` for converting values to JSON strings.
- (Future) Support reflection-based serialization for structs.

**Acceptance Criteria:**

- Can parse a JSON string into a traversable object.
- Can serialize a `Map` or `List` to a JSON string.
- Handles nested objects and arrays correctly.

---

## [7] Standard Library: Cryptography & Hashing

**Description:** Provide basic cryptographic primitives and secure random number generation.

**Implementation Notes:**

- Implement `std.crypto.hash` (SHA256, MD5) wrapping C libraries or native implementation.
- Implement `std.crypto.random` for CSPRNG.
- Ensure secure memory handling for keys (if possible).

**Acceptance Criteria:**

- Can compute the SHA256 hash of a string/byte array.
- Can generate cryptographically secure random bytes.

---

## [7] Standard Library: Regular Expressions

**Description:** Add support for regular expressions to enable powerful string matching and manipulation.

**Implementation Notes:**

- Wrap a C regex library (like `pcre` or POSIX `regex.h`) or implement a basic engine.
- Provide `std.regex.match`, `std.regex.replace`, `std.regex.split`.

**Acceptance Criteria:**

- Can compile a regex pattern.
- Can check if a string matches a pattern.
- Can extract capture groups from a match.

---

## [7] Standard Library: Advanced Collections

**Description:** Expand the collection types available in the standard library beyond `List` and `Map`.

**Implementation Notes:**

- Implement `std.collections.Set<T>` (HashSet).
- Implement `std.collections.LinkedList<T>` (Doubly linked).
- Implement `std.collections.Queue<T>` and `std.collections.Stack<T>`.
- Implement `std.collections.PriorityQueue<T>` (Binary Heap).

**Acceptance Criteria:**

- Can use a Set to filter unique items.
- Can use Queue/Stack for standard algorithms.
- Can use PriorityQueue for scheduling tasks.

---

## [7] Standard Library: BigInt & Arbitrary Precision

**Description:** Add support for arbitrary precision integers and floating point numbers for applications requiring high precision (crypto, scientific computing).

**Implementation Notes:**

- Implement `std.math.BigInt` wrapping `gmp` or a native implementation.
- Overload arithmetic operators for `BigInt`.
- Support string conversion to/from `BigInt`.

**Acceptance Criteria:**

- Can perform arithmetic on integers larger than 64 bits.
- Can print and parse large integers.

---

## [7] Standard Library: Compression & Archiving

**Description:** Add support for data compression and decompression.

**Implementation Notes:**

- Implement `std.compress.zlib` and `std.compress.gzip`.
- Wrap `zlib` or similar C library.
- Provide stream-based and buffer-based APIs.

**Acceptance Criteria:**

- Can compress a string/buffer and decompress it back to original.
- Can read/write gzip files.

---

## [7] Standard Library: Encoding & Decoding

**Description:** Add utilities for common data encodings.

**Implementation Notes:**

- Implement `std.encoding.base64`.
- Implement `std.encoding.hex`.
- Implement `std.encoding.csv` for CSV parsing/generation.

**Acceptance Criteria:**

- Can encode binary data to Base64 string and decode back.
- Can parse a CSV file into a list of records.

---

### Low Priority

## [8] Async/Await

**Description:** Add `async` functions and `await` operator with promise-like semantics to simplify asynchronous programming. This makes non-blocking I/O and concurrent operations feel natural and avoids callback hell, enabling readable asynchronous code.

**Implementation Notes:**

- Decide between transpiling async into callback-based state machines or using runtime coroutines
- Implement state machine transformation for `async` functions
- Create proper Future/Promise types and runtime support
- Implement event loop integration for executing async tasks
- Support proper error handling in async contexts
- Implement `await` operator for suspending and resuming execution
- Handle spawning and joining of async tasks
- Ensure memory safety in concurrent contexts
- Provide debugging support for async code

**Acceptance Criteria:**

- `async` functions return a `Future`/`Promise` type
- `await` operator suspends/resumes correctly
- Asynchronous examples compile and run correctly
- Multiple concurrent tasks can run and complete
- Error handling works properly in async contexts

---

## [8] Threading Support

**Description:** Provide language primitives to create and manage threads, synchronization primitives, and safe concurrency patterns. This enables multi-threaded programs that can utilize multiple CPU cores while maintaining thread safety and preventing race conditions.

**Implementation Notes:**

- Integrate with target threading primitives (pthreads on POSIX, WinAPI on Windows)
- Define clear memory model for concurrent access
- Implement synchronization primitives (Mutex, RwLock, Semaphore)
- Provide atomic operations for lock-free programming
- Implement thread spawning and joining
- Add support for thread-local storage
- Create standard library APIs for thread management
- Ensure safe concurrency through type system where possible
- Implement proper cleanup and resource management

**Acceptance Criteria:**

- Spawn and join threads correctly
- Synchronized access examples behave correctly
- Mutex and other synchronization primitives work properly
- Race conditions are prevented
- Threads can communicate safely through channels or queues

---

## [8] Null Safety Operators

**Description:** Introduce null-safe navigation (`?.`) and null-coalescing (`??`) operators to simplify handling of nullable types (pointers or Option types).

**Implementation Notes:**

- Implement `?.` for safe member access on pointers/options
- Implement `??` for providing default values
- Desugar `a?.b` to `(a != null ? a.b : null)` (or equivalent for Option)
- Desugar `a ?? b` to `(a != null ? a : b)`

**Acceptance Criteria:**

- `ptr?.field` returns null/None if ptr is null/None
- `val ?? default` returns default if val is null/None
- Works with both pointers and `Option<T>`

---

## [8] Middle-end Optimizations

**Description:** Implement BPL-specific optimization passes in the middle-end (before LLVM IR generation) to improve code quality and enable high-level optimizations that LLVM might miss.

**Implementation Notes:**

- Implement Dead Code Elimination (DCE) on the AST or BPL IR
- Implement Constant Folding and Propagation
- Implement Inlining of small BPL functions
- Implement specialized optimizations for BPL constructs (e.g., enum matching)

**Acceptance Criteria:**

- Generated LLVM IR is cleaner and more efficient
- Compile-time evaluation handles more cases
- Runtime performance improves for specific patterns

---

## [8] Compile-Time Function Execution (CTFE)

**Description:** Allow a subset of BPL functions to be executed during compilation to generate constants. This enables complex compile-time calculations and data initialization without runtime cost.

**Implementation Notes:**

- Identify functions marked for compile-time execution (e.g., `const frame`)
- Implement an interpreter for the BPL IR or AST
- Execute code during semantic analysis phase
- Store results as constants in the compiled binary
- Restrict operations (no I/O, no heap allocation unless optimized out)

**Acceptance Criteria:**

- `const global X: int = factorial(5);` compiles with `120` hardcoded
- Can use CTFE results for array sizes `local arr: int[compute_size()];`

---

## [8] Code Coverage Integration

**Description:** Add support for generating code coverage reports to help developers identify untested parts of their code.

**Implementation Notes:**

- Add `--coverage` flag to compiler
- Instrument LLVM IR with coverage mapping (compatible with `llvm-cov`)
- Generate `.profraw` files at runtime
- Document how to view reports using standard tools

**Acceptance Criteria:**

- Compiling with `--coverage` and running tests generates profile data
- Can view line-by-line coverage report using `llvm-cov`

---

## [8] Region-Based Memory Management (Arenas)

**Description:** Add `Arena` allocators to the standard library to simplify manual memory management. Arenas allow allocating many objects and freeing them all at once, reducing the risk of memory leaks and fragmentation.

**Implementation Notes:**

- Implement `std.mem.Arena` struct
- Support `arena.alloc<T>(...)`
- Support `arena.reset()` and `arena.destroy()`
- Optimize for bulk allocation performance

**Acceptance Criteria:**

- Can create an Arena and allocate objects from it
- Destroying the Arena frees all memory
- Performance is better than individual `malloc`/`free` calls for many small objects

---

## [9] REPL (Read-Eval-Print Loop)

**Description:** Implement an interactive shell for rapid prototyping, learning, and testing code snippets. The REPL provides immediate feedback and maintains state across expressions, making the language more approachable and enabling exploratory programming.

**Implementation Notes:**

- Create interactive input loop with proper line handling
- Reuse parser and compiler for parsing REPL input
- Implement statement vs expression handling
- Use JIT compilation or interpretation for immediate execution
- Maintain global scope and variable bindings across lines
- Handle multi-line input gracefully
- Display expression results automatically
- Support special commands (help, clear, exit, etc.)

**Acceptance Criteria:**

- REPL accepts and executes statements and expressions
- Results are displayed after each line
- State persists across lines (variables remain accessible)
- Multi-line input works correctly
- Special commands are available
- Examples demonstrate interactive exploration

---

## [9] Reflection API

**Description:** Provide runtime type inspection and reflection capabilities for accessing type metadata, field information, and method signatures. This enables generic serialization, dependency injection, testing frameworks, and other metaprogramming use cases.

**Implementation Notes:**

- Generate metadata tables during compilation for all types
- Emit metadata into binary (special section or data)
- Create stdlib module with reflection APIs (Type, Field, Method info)
- Implement type ID generation and comparison
- Support field name and offset lookup
- Provide method signature and parameter information
- Implement iteration over fields and methods
- Handle inheritance and method overrides in reflection

**Acceptance Criteria:**

- Runtime type information available for all types
- Can reflect on fields and get names, types, offsets
- Can reflect on methods and get signatures
- Iteration over type members works
- Generic serialization can be implemented using reflection
- Examples show reflection in action (JSON serialization, etc.)

---

## [9] Macro System

**Description:** Implement compile-time code generation through procedural macros. This enables metaprogramming, reducing boilerplate code, creating DSLs, and extending the language with domain-specific syntax.

**Implementation Notes:**

- Define macro syntax (e.g., `macro_rules!` or `#[macro]`)
- Implement macro expansion phase before semantic analysis
- Provide AST manipulation API for macros
- Support pattern matching in macro definitions
- Implement hygiene to prevent variable name collisions
- Support recursive macros with depth limits
- Provide debugging support for macro expansion
- Implement error reporting within macros

**Acceptance Criteria:**

- Macros can be defined and called
- Macros correctly generate code
- Macro pattern matching works
- Generated code is semantically correct
- Hygiene prevents accidental variable capture
- Examples demonstrate practical macro use cases (derive, builders, DSLs)

---

## [9] Extension Methods

**Description:** Allow developers to add new methods to existing types (including standard library types like `string` or `int`) without modifying their source code or using inheritance. This enables "fluent" APIs and better code organization.

**Implementation Notes:**

- **Syntax:** Define syntax like `frame MyType.newMethod(this: MyType, ...)` outside struct definition
- **Resolution:** Update method resolution logic to search for extension functions in scope if member lookup fails
- **Codegen:** Transpile `obj.method(arg)` to `method(obj, arg)`
- **Imports:** Ensure extension methods are properly imported and visible

**Acceptance Criteria:**

- Can add a method to `string` (e.g., `isEmail()`)
- Can call the method using dot notation: `"foo".isEmail()`
- Extension methods respect visibility rules
- Works with generic types

---

## [9] Generators (yield)

**Description:** Implement generators using the `yield` keyword to simplify the creation of iterators. This allows writing iterators as simple functions that maintain state automatically, enabling lazy evaluation and complex traversal logic.

**Implementation Notes:**

- **Syntax:** Add `yield` keyword
- **Transformation:** Compiler transforms generator function into a state machine struct
- **Iterator Interface:** Generated struct implements `Iterator<T>`
- **State Management:** Local variables are promoted to struct fields to persist across yields
- **Control Flow:** Handle loops and conditionals within the generator

**Acceptance Criteria:**

- Function using `yield` returns an `Iterator`
- Can iterate over the result using `loop` or `for`
- State is preserved between yields
- Supports infinite sequences (lazy evaluation)

---

## [9] Pipeline Operator (|>)

**Description:** Add the `|>` operator to pass the result of an expression as the first argument to the next function. This improves readability of nested function calls and enables a linear data flow style.

**Implementation Notes:**

- **Parser:** Add `|>` as a binary operator with low precedence
- **AST Transformation:** Transform `a |> f(b)` into `f(a, b)` during parsing or early semantic analysis
- **Interaction:** Ensure it works with Extension Methods and standard functions
- **Chaining:** Support multiple pipes `a |> f |> g` -> `g(f(a))`

**Acceptance Criteria:**

- `x |> f` compiles to `f(x)`
- `x |> f(y)` compiles to `f(x, y)`
- Chained pipes work correctly
- Works with both free functions and methods

---

## [4] Advanced Type System Features

**Description:** Increases expressiveness and type safety.

**Implementation Notes:**

- **Type Guards:** `if (x is T) { ... }`
- **Intersection Types:** `A & B`
- **Union Types:** `A | B`
- **Conditional Types:** `T extends U ? X : Y`

**Acceptance Criteria:**

- Type guards work correctly
- Intersection and union types are supported

## [5] Parallel Compilation

**Description:** Utilize multi-core processors to compile independent modules in parallel, significantly reducing build times for large projects.

**Implementation Notes:**

- Analyze module dependency graph to identify independent subgraphs
- Use worker threads or child processes to compile modules concurrently
- Manage shared resources (cache, file locks) safely
- Implement a task scheduler for compilation jobs

**Acceptance Criteria:**

- `bpl build` utilizes multiple cores
- Build time decreases for projects with many modules
- No race conditions or corrupted artifacts

---
