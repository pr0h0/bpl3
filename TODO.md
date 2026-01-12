# BPL3 Compiler Progress

- Number inside brackets indicates priority (lower number = higher priority), x indicates completed features.

## Completed Features

- [x] Parser Error Recovery (Multiple syntax errors)
- [x] Formatter Robustness (Throw on Syntax Error)
- [x] Parser Optimization (Peggy location handling)
- [x] Advanced Generics (Constraints, Inference)
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

## Variadic Functions

- [x] Support homogeneous variadics (e.g., `...int`) alongside heterogeneous `...Any`.

  - Currently, all variadics are treated as `...Any` (array of Any structs).
  - Need to support `...T` where T is a specific type, passing `T*` (pointer to array of T) and count.
  - Ensure type checking enforces all arguments match `T`.

## Struct Initialization

- [x] Implicit Constructor Calls

  - When declaring `local x: X;` without initialization:
  - Check if `struct X` has an instance method `frame new(this: *X)`.
  - If yes, implicitly call `x.new()` to initialize the object.
  - This ensures structs with pointers or specific setup requirements are safely initialized.
  - Distinguish from static `frame new(...)` which requires explicit call.

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
- [x] Standard Library Module
- [x] Interfaces/Traits
- [x] Enhanced Error Messages with Location Information
- [x] Shell Autocomplete for CLI
- [x] Operator Overloading for User Types (24 operators: arithmetic, bitwise, comparison, unary, indexing, callable)
- [x] Generic-Aware Operator Resolution (Operators work with generic types like Array<T>, Stack<T>, etc.)
- [x] Enum Types - Complete Implementation ✅ (All essential features implemented and tested)
  - ✅ Enum declaration parsing (unit, tuple, struct variants)
  - ✅ Generic enum support with explicit type parameters
  - ✅ Type checking for enum variants
  - ✅ Unit variant construction (e.g., `Color.Red`)
  - ✅ Tuple variant construction (e.g., `Message.Move(10, 20)`)
  - ✅ Struct variant construction (e.g., `Shape.Circle { radius: 5.0 }`)
  - ✅ Match expressions with discriminant checking
  - ✅ Exhaustiveness checking for match expressions
  - ✅ Pattern destructuring in match arms (tuple and struct patterns)
  - ✅ Outer scope variable access in match arm expressions
  - ✅ Enum as function parameters and return types
  - ✅ LLVM IR code generation with full payload storage
  - ✅ Tuple/struct data payload storage and retrieval with proper alignment
  - ✅ Methods on enums with `this` parameter and generic context inheritance
  - ✅ Enum equality comparison operators (==, !=) with tag and payload comparison
  - ✅ Recursive enums with pointer types and proper memory layout
  - ✅ Generic enum type mangling with normalized primitive types (int→i32)
  - ✅ Pattern guards in match expressions - Conditional matching with `if` guards (e.g., `Option.Some(x) if x > 0 => "positive"`)
  - ✅ Type checking with `match<Type>` - Runtime variant discrimination (e.g., `if (match<Option.Some>(opt)) { ... }`)
  - ✅ Formatter support for enums and match expressions
  - ✅ Comprehensive test suite (93 enum-specific tests, 756 integration tests, all passing)
  - ✅ Example programs demonstrating all enum features
  - ✅ Full documentation (user guide and implementation details)
  - ✅ Root Global `Type` Struct - Implicit inheritance for all structs
  - 📝 Future enhancements (non-critical, workarounds exist):
    - Nested pattern matching (e.g., `Outer.Wrapped(Inner.Value(v))`) - use nested match expressions
    - Direct field access on struct variants (e.g., `msg.x`) - use pattern matching instead
    - Namespace-qualified patterns in match (e.g., `Enums.Color.Red`) - import enum directly
    - Generic enum type inference (e.g., `Option.Some(42)` → `Option<int>`) - requires bidirectional type checking
- [x] Multi-Target Support (Cross-compilation via LLVM target triples)
- [x] Root Global `Type` Struct (Implicit inheritance for all structs)
- [x] Primitive Types as Structs Inheriting `Primitive` (Wrapper structs for int, float, bool, char)
- [x] Defer Statement ✅
  - ✅ `defer` keyword implemented
  - ✅ LIFO execution order
  - ✅ Scope-bound cleanup
  - ✅ Void return enforcement
  - ✅ Recursion/Stack Overflow fix (LambdaCall)
  - ✅ VS Code Extension support
- [x] Closures and Lambda Expressions ✅
  - ✅ Lambda syntax `|args| body` implemented
  - ✅ Capture by value semantics verified
  - ✅ `Func<Ret>(Args...)` type support
  - ✅ VS Code Extension support (Syntax Highlighting & Hover)
  - ✅ Integration with Enum Pattern Matching (Capturing pattern bindings)
- [x] Const Correctness ✅
  - ✅ `const` keyword for local variables
  - ✅ `const` keyword for function parameters
  - ✅ Immutability enforcement in TypeChecker

## Pending Features

- [x] C-style For Loop Support ✅

  - ✅ Syntax: `loop(local i:int=0; i<10; ++i) { ... }`
  - ✅ Desugaring to `while` loop with block scope (Implemented directly in Codegen)
  - ✅ Verify scope behavior (block vs function scope)

- [x] Scope Verification Task ✅

  - ✅ Validate and verify how scopes work
  - ✅ Determine if each block has its own scope or if variables are hoisted
  - ✅ Document findings

  - ✅ Recursive mutability checking for member access and indexing
  - ✅ `this` treated as const pointer in methods

- [x] Documentation Generator ✅
  - ✅ Multi-line comment syntax changed to `/# ... #/` to avoid Markdown conflict
  - ✅ Markdown generation from comments
  - ✅ Standard Library documentation
  - ✅ CLI `docs` command
- [x] Type Narrowing / Pattern Matching ✅
  - ✅ `is` operator for type checking (e.g., `x is int`)
  - ✅ `as` operator for type casting (e.g., `x as float`)
  - ✅ Struct upcasting (e.g., `Dog` as `Animal`)
  - ✅ Chained casts support (e.g., `x as int as float`)
  - ✅ Formatter support for `as`/`is` expressions (parentheses enforcement)
  - ✅ Integration with `match` expressions
  - ✅ Comprehensive test suite covering inheritance, specs, and enums
- [x] Unused Variable Detection ✅
  - ✅ Compiler error for unused local variables
  - ✅ `_` prefix suppression support
  - ✅ Integration with all existing tests
- [x] Internal Error Structs for Standard Library (Replace integer error codes with proper structs) ✅
  - `ResultUnwrapError`, `OptionUnwrapError`
  - `IndexOutOfBoundsError`, `NullPointerError`
  - `DivisionByZeroError`, `IOError`, `CastError`
- [x] LSP Enhancements ✅
  - ✅ Rename Symbol
  - ✅ Find References
  - ✅ Go to Implementation
  - ✅ Code Actions (Auto-import)
  - ✅ Expanded Snippets
- [x] Result<T, E> Type Implementation ✅
  - ✅ `Result<T, E>` enum in standard library
  - ✅ Helper methods: `isOk`, `isErr`, `unwrap`, `unwrapOr`, `map`, `mapErr`
  - ✅ Operator overloading for Generic Enums (Backend support)
  - ✅ Equality operators (`==`, `!=`) for `Result` and `Option`
  - ✅ Integration tests verifying `Result` functionality
- [x] CLI Eval Error Display Fix ✅
  - ✅ `DiagnosticFormatter` uses `SourceManager` for virtual files
  - ✅ Correct error snippets shown for `--eval` code
- [x] Fuzz Testing Integration ✅
  - ✅ Fuzz Target: `fuzz/fuzz_target.ts` runs lexer/parser/typechecker
  - ✅ Fuzz Runner: `fuzz/run_fuzz.ts` generates random/mutated inputs
  - ✅ Crash Detection: Automatically saves crashing inputs to `fuzz/crash_*.bpl`
- [x] Compiler Performance Benchmarking ✅
  - ✅ Benchmark Script: `benchmark/measure_compilation.ts`
  - ✅ Synthetic Tests: Generates large files (1k-5k functions) to stress test
  - ✅ Metrics: Measures compilation time in milliseconds
- [x] String Interpolation ✅
  - ✅ Syntax: `$"..."` literals with `${expr}` interpolation
  - ✅ Lexer/Parser: Updated to handle interpolated strings
  - ✅ Type Checker: Desugars to `String` concatenation
  - ✅ Codegen: Generates code for concatenated strings
  - ✅ Documentation: Added `docs/54-string-interpolation.md`
- [x] Allow Structs to Inherit Primitives ✅
  - ✅ Syntax: `struct A : int`
  - ✅ Type Checker: Validates inheritance and allows casting
  - ✅ Codegen: Handles layout (`__base__` field) and casting (wrap/unwrap)

## Partially Completed Features

- [x] Inline Assembly Blocks ✅

  - ✅ Syntax: `asm("flavor") { ... }`
  - ✅ Flavors: `intel`, `att`, `llvm`, `raw`
  - ✅ Interpolation: `(var)` (input), `(=var)` (output), `(&var)` (address)
  - ✅ Constraints: Explicit LLVM constraints `(var: "r")`
  - ✅ Clobbers: `[ "eax", "memory" ]`
  - ✅ Codegen: Generates `call asm` for x86/att, raw injection for llvm/raw
  - ✅ Tests: `examples/asm_test`, `examples/asm_flavors_test`

    - ❌ Flavor-based wrapping (e.g. `call asm`)
    - ❌ Explicit register constraints
    - ❌ Validation of assembly content

- [ ] **Semantic Analysis Improvements**

  - **Status:** PARTIAL
  - Implemented:
    - ✅ Unreachable code detection
    - ✅ Redeclaration check (same scope)
    - ✅ Unused variable detection
  - Missing:
    - ❌ Shadowing warning (outer scope)

- [x] **Debugger Support (DWARF)**
  - **Status:** COMPLETED
  - Implemented:
    - ✅ CLI Flag: `--dwarf`
    - ✅ Metadata Generator: `DebugInfoGenerator` class
    - ✅ Compile Unit: Emits `!llvm.dbg.cu` and `!DICompileUnit`
    - ✅ Subprograms: Emits `!DISubprogram` for functions
    - ✅ Line Info: Attaches `!dbg` location to instructions
    - ✅ Full type descriptors for complex types (Structs, Enums, Arrays, Slices)
    - ✅ Variable location tracking (`llvm.dbg.declare`)

## Pending Features (Prioritized)

### High Priority (Next Steps)

- [ ] **Advanced Type System Features**

  - [ ] Type Guards (User-defined `is` functions)

- [5] **Parallel Compilation**

  - Description: Utilize multi-core processors to compile independent modules in parallel.
  - Implementation notes: Analyze dependency graph, use worker threads/processes, manage shared resources.

- [x] **Watch Mode** ✅
  - **Status:** COMPLETED (January 2026)
  - Description: Add `--watch` mode to CLI to recompile on file changes.
  - Implementation notes: Use file watcher, integrate with incremental compilation, debounce events.
  - **What Was Implemented:**
    - ✅ Created `cli/Watcher.ts` with file watching logic
    - ✅ Added `--watch` flag to CLI
    - ✅ Implemented debouncing (100ms) to prevent excessive recompilation
    - ✅ Error recovery that continues watching after compilation failures
    - ✅ Recursive watching of all `.bpl` files in directory tree
    - ✅ Smart filtering (ignores node_modules, .git, bpl_modules)
    - ✅ Documented in `docs/39-compiler-options.md` and `docs/03-quick-start.md`

### Medium Priority

- [4] **RAII & Automatic Resource Management**

  - Description: Add automatic destructor calls and ownership semantics.
  - Implementation notes:
    - Define `Destructible` interface in stdlib.
    - Implement compiler pass to inject `x.destroy()` at end of scope.
    - Implement "Move Semantics" (nullify source variable on return/assignment) to prevent double-free.
    - Add `Unique<T>` and `Shared<T>` smart pointers.

- [6] **Default and Named Arguments**

  - Description: Allow functions to define default values for parameters and allow callers to specify arguments by name.
  - Implementation notes: Update declaration/call syntax, resolve defaults at call site, handle named args.

- [6] **Parser Error Recovery**

  - Description: Improve parser to recover from syntax errors and continue parsing.
  - Implementation notes: Implement synchronization points, skip tokens, mark error nodes.

- [6] **Nested Pattern Matching**

  - Description: Extend pattern matching to support nested patterns (e.g., `Option.Some(Result.Ok(x))`).
  - Implementation notes: Update parser/typechecker/codegen for recursive pattern matching.

  - Description: Add public/private visibility modifiers and module encapsulation.
  - Implementation notes: Add pub/private keywords, enforce visibility during semantic analysis, support module-level exports.

- [3] ✅ **Basic Package Management (COMPLETED)**

  - Description: Implement core package management commands to pack, install, and resolve local packages.
  - Implementation notes: Implemented `bpl pack`, `bpl install`, and module resolution logic.

- [7] **Package Registry and Advanced Dependency Management**

  - Description: Create a centralized package registry and enhance package manager for publishing/versioning.
  - Implementation notes: Design metadata format, implement semantic versioning, create registry API, add publish/install commands.

- [7] **WebAssembly (WASM) Target**

  - Description: Add compilation target for WebAssembly (WASM) to run BPL in browsers.
  - Implementation notes: Add wasm32 target support, handle ABI differences, map primitives, generate .wasm via LLVM.

- [7] **Automatic C Binding Generation (bindgen)**

  - Description: Tool to generate BPL `extern` declarations from C headers.
  - Implementation notes: Use libclang to parse headers, map types, generate BPL files.

- [7] **Standard Library Expansions**
  - [ ] Structured Logging (Log levels, formatters, output targets)
  - [ ] CLI Argument Parser (Flags, Options, Subcommands, Help generation)
  - [ ] Networking & HTTP (TCP/UDP, HTTP client)
  - [ ] System Calls & OS Interaction (Signals, Env vars, Process control)
  - [ ] Date & Time (Date, Time, Duration, Formatting)
  - [ ] JSON & Serialization (Parse/Stringify)
  - [ ] Cryptography & Hashing (SHA256, Random)
  - [ ] Regular Expressions (Match, Replace, Split)
  - [ ] Advanced Collections (Set, LinkedList, Queue, Stack, PriorityQueue)
  - [ ] BigInt & Arbitrary Precision (GMP wrapper or native)
  - [ ] Compression & Archiving (zlib/gzip)
  - [ ] Encoding & Decoding (Base64, Hex, CSV)

### Low Priority / Long Term

- [8] **Null Safety Operators**

  - Description: Introduce null-safe navigation (`?.`) and null-coalescing (`??`) operators.
  - Implementation notes: Implement `?.` and `??` operators, desugar to conditional checks.

- [8] **Middle-end Optimizations**

  - Description: Implement BPL-specific optimization passes before LLVM IR generation.
  - Implementation notes: Dead code elimination, constant folding, inlining on AST/IR.

- [8] **Compile-Time Function Execution (CTFE)**

  - Description: Execute functions at compile time to generate constants.
  - Implementation notes: Interpreter for BPL IR/AST, execute during semantic analysis.

- [8] **Code Coverage Integration**

  - Description: Generate coverage reports for tests.
  - Implementation notes: Instrument LLVM IR with coverage mapping, support llvm-cov.

- [8] **Region-Based Memory Management (Arenas)**

  - Description: Add Arena allocators to stdlib for efficient memory management.
  - Implementation notes: Implement Arena struct, bulk allocation/deallocation.

- [8] **Async/Await**

  - Description: Add `async` functions and `await` operator with promise-like semantics.
  - Implementation notes: Decide on state machines vs coroutines, implement event loop integration.

- [8] **Threading Support**

  - Description: Provide language primitives to create and manage threads, synchronization primitives.
  - Implementation notes: Integrate with target threading primitives, define memory model.

- [9] **REPL (Read-Eval-Print Loop)**

  - Description: Implement interactive shell for quick prototyping and testing.
  - Implementation notes: Create input loop, reuse parser/compiler, use JIT or interpreter.

- [9] **Source Code Display for Eval/Stdin Errors**

  - Description: Fix error message code snippets when compiling from stdin or eval.
  - Implementation notes: Modify CompilerError to accept source lines directly.

- [9] **Reflection API**

  - Description: Provide runtime type inspection and manipulation capabilities.
  - Implementation notes: Generate type metadata during compilation, expose reflection APIs in stdlib.

- [9] **Macro System**

  - Description: Implement compile-time code generation with procedural macros.
  - Implementation notes: Define macro syntax, implement macro expansion phase.

- [9] **Extension Methods**

  - Description: Allow adding methods to existing types without inheritance.
  - Implementation notes: Define syntax, update symbol table to find extension methods, transpile to static calls.

- [9] **Generators (yield)**

  - Description: Simplify iterator creation using `yield` keyword.
  - Implementation notes: Transform generator functions into state machine structs implementing Iterator.

- [9] **Pipeline Operator (|>)**
  - Description: Syntactic sugar for function chaining `x |> f` -> `f(x)`.
  - Implementation notes: Update parser to handle `|>` operator, transform AST to nested calls.
