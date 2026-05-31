# Changelog

All notable changes to the BPL compiler project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Hosted Wasm Regression Example** - Added `examples/wasm_hosted_transform`
  to exercise argv, stdout/stderr, stdlib `String`, enum matching, generics, and
  lambda capture through both native integration tests and hosted wasm runtime
  execution.
- **Fuzz Artifact Repro Helper** - Added `bun run fuzz:repro -- <artifact-path>`
  to turn downloaded scheduled fuzz crash artifacts into deterministic local
  replay, minimization, seed rerun, and regression promotion commands.
- **Hosted Wasm Printf Formatting** - Hosted WebAssembly `printf`, `fprintf`,
  and `dprintf` now format the documented `%s`, `%d`, `%c`, and `%%` subset, with
  a native-compatible `examples/wasm_hosted_printf` regression and explicit
  coverage for null strings, integer extremes, dangling `%`, and unsupported
  specifiers.
- **Hosted Wasm Import Contract** - Added regression coverage that keeps the
  hosted wasm runtime declarations, browser playground adapter, and wasm runtime
  test host aligned on the required `env.__bpl_host_*` imports.
- **Release Helper Script Coverage** - Release smoke now discovers package
  scripts that call `tools/*.ts`, packs the referenced helper tools, and
  records release-manifest checksums for those helper tools. It also exercises
  the packed `fuzz:repro` helper so script entrypoints do not drift from shipped
  files.
- **Agent Board Workflow Docs** - Documented the BPL Agent Board as the
  credential-free source of truth for active task tracking, criteria, review
  state, and verification evidence.
- **CI Triage Helper** - Added `bun run ci:triage -- <actions-run-url>` to
  summarize failed GitHub Actions jobs and print local reproduction commands
  without requiring GitHub admin access. The helper now also supports offline
  `--help` output for packed-package smoke checks.
- **CI Triage Option Validation** - `bun run ci:triage` now reports missing
  `--repo` and `--run` option values as usage errors before attempting any
  GitHub API request.
- **Run-Script JSON Errors** - `bpl run-script --json` now reports manifest and
  script validation failures as machine-readable `{ success, error }` JSON while
  preserving human-readable logger output without `--json`.
- **Build JSON Validation Coverage** - `bpl build --json` now has explicit
  regression coverage and docs for invalid compiler options, input/output path
  validation, stdout-only failure reports, and no failed artifact leftovers.
- **Check JSON Stability** - `bpl check --json` now includes stable
  `schemaVersion: 1` and `check: "check"` metadata alongside the existing
  aggregate totals, timing, per-file diagnostics, and validation errors.
- **Lint JSON Stability** - `bpl lint --json` now includes stable
  `schemaVersion: 1` and `check: "lint"` metadata alongside the existing
  aggregate totals, per-file lint diagnostics, and validation errors.
- **Doctor JSON Failure Coverage** - JSON parseability tests now assert unknown
  doctor scopes return stdout-only `schemaVersion: 1`, `check: "doctor"`,
  `success: false`, and `error` metadata.
- **Run-Script Argument Forwarding Coverage** - Added regression coverage for
  option-looking, empty, quoted, substituted, piped, redirected, ampersand, and
  multiline arguments forwarded through `bpl run-script`.
- **Package Doctor JSON Stability** - `bpl doctor packages --json` now includes
  stable `schemaVersion`, `check`, and `success` top-level fields, with
  regression coverage for lockfile, dependency tree, issue, and package-cache
  provenance warning shapes.
- **Toolchain Doctor JSON Stability** - `bpl doctor --json` now includes stable
  `schemaVersion: 1` and `check: "toolchain"` fields alongside the existing
  `success`, `version`, `platform`, `bplHome`, and `checks` fields. Unknown
  doctor scopes in JSON mode now emit structured `{ success: false, error }`
  output on stdout instead of human logger text on stderr.
- **Package Cache Verify JSON Stability** - `bpl package-cache verify --json`
  now includes stable `schemaVersion: 1`, `check: "package-cache-verify"`, and
  `success` fields, with CLI regressions for missing-provenance issue shapes.
- **Release Smoke Doctor JSON Coverage** - Release smoke now validates packed
  `bpl doctor --json` and `bpl doctor packages --json` schema contracts,
  including isolated package-cache verification for the package doctor path.
- **Release Smoke Doctor Failure Coverage** - Release smoke now validates packed
  `bpl doctor <unknown> --json` failure metadata, including stdout-only
  `schemaVersion`, `check: "doctor"`, `success: false`, and `error` output.
- **Release Smoke Package Cache JSON Coverage** - Release smoke now validates
  packed `bpl package-cache list --json` output with an isolated cache home.
- **Release Smoke Package List JSON Coverage** - Release smoke now validates
  packed `bpl list --json` and `bpl list --tree --json` metadata through the
  installed npm CLI.
- **Release Smoke Package Cache Verify Coverage** - Release smoke now validates
  packed `bpl package-cache verify --json` output with an isolated cache home.
- **Release Smoke Check/Lint JSON Coverage** - Release smoke now validates
  packed `bpl check --json` and `bpl lint --json` contract metadata through the
  installed npm CLI.
- **Release Smoke Run-Script JSON Coverage** - Release smoke now validates
  packed `bpl run-script --list --json` output and confirms listing scripts
  does not execute them.
- **Release Smoke Run-Script Failure Coverage** - Release smoke now validates
  packed `bpl run-script --list --json` failure output from an empty package
  directory, including exit status, empty stderr, and JSON error metadata.
- **CLI JSON Compatibility Policy** - Documented the versioning policy for
  machine-readable CLI JSON, including additive fields, unknown-field handling,
  and `schemaVersion` bumps for breaking shape changes.
- **Run-Script List JSON Stability** - `bpl run-script --list --json` now
  includes stable `schemaVersion: 1`, `check: "run-script-list"`, and
  `success: true` fields alongside the existing `scripts` array.
- **Run-Script JSON Failure Stability** - `bpl run-script --list --json`
  validation failures now include stable `schemaVersion` and
  `check: "run-script-list"` fields alongside `success: false` and `error`.
- **Run-Script Missing Script JSON Coverage** - Added coverage for
  `bpl run-script <missing> --json` returning `schemaVersion: 1`,
  `check: "run-script"`, `success: false`, and `error` without printing the
  human script list.
- **Shared CLI JSON Contract Constants** - CLI and package-manager JSON report
  emitters now share one schema/check helper so package doctor and package-cache
  maintenance reports cannot drift from the documented contract strings.
- **CLI JSON Contract Inventory** - Added a source-level inventory that maps
  documented JSON commands to shared check constants and verifies emitters do
  not call the JSON report helper with duplicated string literals.
- **Package Cache Maintenance JSON Coverage** - Added parseability regression
  coverage for empty `package-cache clean --dry-run --json` and
  `package-cache repair --dry-run --json` reports.
- **Package List Tree JSON Coverage** - Added parseability coverage for
  `bpl list --tree --json` so both package list JSON report variants stay under
  the shared contract guard.
- **Package Resolver Symlink Coverage** - Added direct resolver regressions that
  keep symlinked package manifests, subpath files, and subpath directories from
  satisfying package imports.
- **Package Resolver Import Segment Coverage** - Added direct resolver
  regressions for empty, `.`, and `..` package import path segments, including
  proof that invalid imports return before filesystem search.
- **Package Import Diagnostic Coverage** - Added module resolver regressions so
  package manifest name mismatches and unsafe package entrypoints keep their
  detailed hints after import-resolution error wrapping.
- **Package Import Safety Docs** - Documented tested package import safety
  rules for invalid path segments, manifest-name matching, global versioned
  directories, and symlink rejection.
- **Strict Package Manifest Paths** - Package `main`, `exports`, and `bin`
  manifest paths now reject empty, `.`, and `..` segments instead of
  normalizing ambiguous package-relative paths.
- **CLI Pack Manifest Path Coverage** - Added CLI regressions proving
  `bpl pack` rejects ambiguous package manifest paths before creating archives.
- **Package Resolver Precedence Guard** - Module resolution now treats malformed
  project package metadata as terminal, preventing fallback to unrelated cwd or
  search-path packages with the same import name.
- **Strict Manifest Path Docs** - Documented strict package-relative `main`,
  `exports`, and `bin` path rules for package manifests.
- **Standard Library Import Safety** - Explicit `std/` imports now reject empty,
  `.`, and `..` path segments before resolving against the standard library
  root.
- **CLI Standard Library Import Diagnostics** - Added CLI regressions proving
  unsafe `std/` imports fail during `check` and before build artifacts are
  written.
- **Standard Library Import Safety Docs** - Documented that explicit `std/`
  import paths must be normalized subpaths without empty, `.`, or `..`
  segments.
- **Import Resolver Diagnostic Preservation** - Normal import checking now
  preserves `ModuleResolver` diagnostics instead of replacing malformed
  package metadata errors with generic filesystem fallback failures.
- **Package Import Diagnostic Build Coverage** - Added regressions proving
  malformed package metadata diagnostics stay intact across `check`,
  `build --emit llvm`, and cached builds without writing failed artifacts.
- **Import Diagnostics JSON Coverage** - Added `bpl check --json` regressions
  for unsafe `std/` imports and malformed package metadata, including stable
  report totals and per-file diagnostic locations.
- **Import Diagnostic Policy Docs** - Documented that normal check/build modes
  preserve resolver-specific import diagnostics while frontend-only emit modes
  parse without loading imports.
- **Build JSON Import Diagnostics** - `bpl build --json` failures now include
  structured compiler diagnostics alongside the existing formatted `error`
  field, with coverage for unsafe `std/` imports and malformed package
  metadata.
- **Missing Import Diagnostic Coverage** - Added regressions for missing
  relative imports across `check`, `check --json`, and `build --emit llvm`,
  including resolved-path details and no failed artifacts.
- **JSON Import Diagnostic Docs** - Documented how `bpl check --json` and
  `bpl build --json` report import-resolution diagnostics, including build's
  backward-compatible formatted `error` field plus structured `diagnostics`.
- **Build JSON Type Diagnostic Coverage** - Added regression coverage that
  ordinary `bpl build --json` type-check failures include structured
  diagnostics with source locations and previews while preserving `error`.
- **Virtual Source JSON Diagnostic Coverage** - Added `--eval` and `--stdin`
  JSON-mode build failure coverage for stable `<eval>`/`<stdin>` labels and
  source previews.
- **CLI JSON Contract Docs** - Added a machine-readable JSON contract table for
  check, lint, doctor, package doctor, package-cache verify, run-script, clean,
  and package list/tree commands.
- **Clean JSON Stability** - `bpl clean --json` and
  `bpl clean --dry-run --json` now include stable `schemaVersion: 1`,
  `check: "clean"`, and `success` fields alongside existing `dryRun`, `count`,
  and `entries` fields.
- **Package Cache Maintenance JSON Stability** - `bpl package-cache clean
  --json` and `bpl package-cache repair --json` now include stable
  `schemaVersion: 1`, `check`, and `success` fields alongside existing
  removed/repaired/unchanged/issues payloads.
- **Package Cache List JSON Stability** - `bpl package-cache list --json` now
  includes stable `schemaVersion: 1`, `check: "package-cache-list"`, and
  `success` fields with cached archive data under `entries`.
- **Package List JSON Stability** - `bpl list --json` and
  `bpl list --tree --json` now include stable `schemaVersion: 1`, `check`, and
  `success` fields while preserving existing package summary and dependency
  tree payloads.
- **Build JSON Stability** - `bpl build --json` now emits a stable
  `schemaVersion: 1`, `check: "build"`, `success`, artifact output, and error
  shape on stdout for tooling.
- **CLI JSON Test Helper** - Added a shared test helper for JSON stdout
  parseability assertions used by CLI JSON contract tests.
- **Enhanced Runtime Library** - Comprehensive runtime error handling with beautiful diagnostics:
  - **Signal Handlers**: Automatic installation of handlers for SIGSEGV, SIGFPE, SIGILL, SIGABRT, and SIGBUS
  - **Colored Error Boxes**: Formatted error output with ASCII box drawing and ANSI colors
  - **Stack Traces**: Both native (using `backtrace()` and `dladdr()`) and BPL-level call stack traces
  - **Runtime Error Types**:
    - NULL pointer access with expression and location info
    - Index out of bounds with index/size details
    - Division by zero with function context
    - Stack overflow detection
  - **New Files**:
    - `lib/runtime_support.c` - C runtime support (signal handlers, stack traces, formatting)
    - `lib/build_runtime.sh` - Build script for runtime library
  - **Documentation**: Added `docs/66-runtime-library.md` with complete runtime architecture

- **Strict Switch Semantics** - Improved control flow safety for switch statements:
  - **Explicit Termination**: All `case` and `default` blocks must now strict end with a terminator (`break`, `return`, `throw`, `continue`, or `fallthrough`).
  - **Explicit Fallthrough**: Added `fallthrough` keyword to explicitly transfer control to the next case.
  - **Break in Switch**: Added support for standard `break` statements within switch cases (previously only allowed in loops).
  - **Fixes**: Resolved multiple regressions in legacy tests causing implicit fallthrough or missing termination bugs.
  - **Documentation**: Updated `docs/07-control-flow.md` and `AGENTS.MD` with new strict switch rules.
  - **VS Code Extension**: Updated syntax highlighting and snippets to support `fallthrough`.
  - **Formatter**: Updated code formatter to handle `fallthrough` and indent strict switch cases correctly.

- **Process Execution Module** - Added `std/process.bpl`:
  - Execute commands with `exec(args...)`
  - Get status with `execStatus(args...)`
  - Capture output with `execOutput(args...)` -> `ProcessResult`
  - **Execute raw shell commands** with `execShell(cmd)` for pipes/redirects
  - **Silent execution** with `execSilent(args...)`
  - **Sleep** with `sleep(ms)`
  - Variadic arguments support with automatic space joining and **automatic OS command injection protection**
  - Cross-platform helper module for common system tasks
- **Pattern Matching Enhancements** - Comprehensive pattern matching support:
  - **Primitive Pattern Matching**: Full support for int, i8, i16, i32, i64, u8, u16, u32, u64, float, f32, f64, bool, string, and char types
  - **Tuple Pattern Matching**: Match and destructure tuples of any size (2-element, 3-element, etc.)
  - **Pattern Types**:
    - Literal patterns: `0`, `3.14`, `true`, `"hello"`, `'A'`
    - Identifier patterns: `x`, `n` (binds matched value)
    - Tuple patterns: `(a, b)`, `(0, y)`, `(x, y, z)`
    - Wildcard pattern: `_` (matches anything)
    - Guard clauses: `pattern if condition` (conditional patterns)
  - **Formatter Support**: Updated code formatter to handle all pattern types including PatternTuple
  - **Type Normalization**: Fixed float→double and bool→i1 type handling in LLVM backend
  - **Examples**: Added comprehensive examples in `examples/primitive_patterns/` and `examples/tuple_patterns/`
  - **Test Coverage**: 49 new tests covering all pattern matching features
- **New CLI Commands** - Major CLI restructure for better usability:
  - `bpl run <file> [args...]` - Compile and execute in one command
  - `bpl dev <file> [args...]` - Development mode with watch and auto-run
  - `bpl build <file>` - Explicit compilation command
  - `bpl check <files...>` - Fast type checking without code generation
  - `bpl new <name>` - Project scaffolding with standard structure
  - `bpl clean` - Remove build artifacts and caches
- **New Global Flags**:
  - `-q, --quiet` - Suppress non-error output
  - `-O <level>` - Optimization levels: 0 (default), 1, 2, or 3
  - `--debug` - Alias for --dwarf (debug information)
  - `--time` - Show compilation time statistics
  - `--json` - Output in JSON format (for tooling)
  - `--color/--no-color` - Force/disable colored output
- **Dev Command Options**:
  - `--clear` - Clear screen on each recompile
  - `--no-run` - Compile only without execution
- **Logger System** - Replaced all `console.*` calls with structured Logger:
  - LogLevel enum (DEBUG, INFO, WARN, ERROR, SILENT)
  - Colorized output with context tagging
  - Time profiling with `time()` method
  - Integrated throughout compiler and CLI

### Changed

- **Runtime Asset Diagnostics** - `bpl doctor` now points missing runtime
  support objects at `bun run build:runtime` plus `bpl doctor`, and missing
  runtime IR files at `bpl doctor` plus reinstall/restore guidance.
- **Release Smoke Wasm Coverage** - Release smoke now discovers dedicated
  `examples/wasm_*` fixtures dynamically and requires both `main.bpl` and
  `test_config.json` to be present in the package.
- Updated `lib/process.bpl` to use variadic arguments for all execution functions, improving UX and safety.
- Expanded `std` exports to include `std/process.bpl`.

- **BREAKING**: Removed `--run` flag from main command (use `bpl run` instead)
- **BREAKING**: Removed `--watch` flag from main command (use `bpl dev` instead)
- **BREAKING**: Changed `-g` flag from global to `-d` for DWARF debug info
- Main command now focused on basic compilation (file → LLVM IR)
- Updated all test files (16 files) to use `bpl run` command
- All compilation workflows now use dedicated commands for clarity
- Enhanced `processCode` function signature to include `sourceLabel` parameter
- Improved CLI architecture with better separation of concerns
- **JSON Library**: Refactored `JsonParser.parseString` in `lib/json.bpl` to use flat `else if` chains instead of deep nesting, improving code readability.

### Documentation

- Updated README.md with comprehensive CLI command reference
- Rewrote `docs/39-compiler-options.md` with command-first structure
- Updated `docs/03-quick-start.md` to use `bpl run` command
- Added complete examples for all new commands and flags
- Documented optimization levels, debug options, and cross-compilation
- Added workflow examples for development, production, and CI/CD
- **Pattern Matching Documentation**:
  - Added comprehensive pattern matching section to `docs/07-control-flow.md`
  - Updated `LANGUAGE_SPEC.md` with pattern syntax and examples
  - Updated `AGENTS.MD` with pattern matching reference
  - Added pattern matching examples covering all supported types
- **Runtime Type Operators Documentation**:
  - Updated `docs/06-operators.md` with `is` and `as` operator documentation
  - Updated `docs/56-type-matching.md` with comprehensive struct pointer type checking guide
  - Added examples for runtime type checking and safe downcasting patterns

### Fixed

- **Package Import Manifest Validation**: Package resolution now rejects malformed package roots whose `bpl.json` `name` does not match the requested import, and rejects versioned global package directories whose manifest `version` does not match the directory version.
- **WebAssembly Linker Selection**: Treat explicit `WASM_LD` settings as authoritative instead of falling back to other linker names on `PATH`, making CI and local wasm linker failure tests deterministic.
- **Unicode String Encoding (BUG-118)**: Fixed LLVM IR generation for strings containing non-ASCII characters. The `escapeString()` function now uses `TextEncoder` to properly compute UTF-8 byte lengths, preventing size mismatches between LLVM IR string constants and their declared array lengths.
- **Runtime Type Checking with `is` Operator (BUG-119)**: Fixed the `is` operator for struct pointer types to perform proper runtime vtable comparison. Previously, `is` only performed compile-time type checking, always returning `true` even for incorrect derived types. Now it correctly checks the actual runtime type via vtable comparison.
- **Safe Downcasting with `as` Operator (BUG-120)**: Fixed the `as` operator for struct pointer types to perform safe runtime downcasting. Previously, `as` would cast any pointer without validation. Now it validates the runtime type via vtable comparison and returns `nullptr` if the types don't match, enabling safe downcast patterns like `local dog: *Dog = animal as *Dog; if (dog != nullptr) { ... }`.
- **VTable Generation for Inherited Structs**: Structs that participate in inheritance hierarchies now properly receive vtables even if they don't define methods. This enables runtime type identification for all polymorphic types.
- **Struct Equality**: Fixed invalid LLVM IR generation (`icmp` on aggregate types) for struct and lambda equality comparisons by implementing member-wise comparison and literal `memcmp` fallback.
- **Pattern Matching Code Generation**:
  - Fixed float literal generation in pattern matching (append `.0` for float types)
  - Fixed type name normalization (float→double, bool→i1) in primitive type detection
  - Fixed register ordering bug in tuple pattern string comparison (strcmpResult before cmpReg)
  - Fixed exit code issues in pattern matching examples (return 0 from main)
- Flag conflicts between main program and subcommands resolved
- Commander.js parent option inheritance issues fixed
- Restored `--eval` and `--stdin` flags for direct code execution
- Type definitions for all new CLI options in `cli/types.ts`
- **Reflection Type Identification**: Fixed a bug where `double` types were incorrectly identified as `void` in `ReflectionGenerator`, ensuring correct `TypeInfo` generation and `Any` construction.
- **Example Projects**: Fixed compilation and runtime issues in multiple existing examples:
  - `json_io_demo`: Added missing test config and fixed imports.
  - `jsonable_test`: Rewrote to use proper `std/json` library and fixed test config.
  - `method_reflection_test`: Fixed standard library imports.
  - `reflection_basic`: Fixed struct layout mismatch by importing `TypeInfo` from `std/reflection.bpl`.
  - `type_match`: Fixed test expectation for double/float types.

### Known Limitations

- See [BUGS.md](BUGS.md) for the current bug ledger. BUG-104 nested tuple pattern matching has since been fixed.

## [Previous Release]

### Added

- **Watch Mode** (`bpl dev` command; formerly the main-command `--watch` flag) for automatic recompilation on file changes
  - Monitors all `.bpl` files in directory tree for changes
  - Automatic recompilation with 100ms debouncing to prevent excessive builds
  - Error recovery: continues watching even after compilation failures
  - Smart filtering: ignores `node_modules`, `.git`, `bpl_modules`, and hidden directories
  - Colorized console output with timestamps and status indicators
  - Runs the program after successful compilation by default; use `--no-run` to only compile
  - See `docs/39-compiler-options.md` for detailed usage guide
- Created `test_config.json` for bug_086_test_simple integration test
  - Tests sizeof operations on type aliases (int, int[10], pointers)
  - Ensures integration test suite has complete coverage

### Fixed

- **BUG-102**: Fixed qualified name resolution for nested generic enums with namespaces (e.g., `std.Option<std.Option<int>>`)
  - Updated `TypeGenerator.resolveType()` to strip namespace prefixes when direct lookup fails
  - Allows using fully qualified enum names in nested generic contexts
  - Fixes compilation errors with enum_chaining_test example
- **BUG-103**: Fixed enum-to-enum casting data payload loss
  - Enhanced `UnaryExpressionGenerator.emitCast()` to copy both discriminant tag and data payload
  - Uses extractvalue/insertvalue for same-size data, memcpy for different sizes
  - Correctly preserves nested enum values during assignment and pattern matching

### Changed

- Updated test suite: **1,342 tests passing** (up from 1,323)
- All integration tests now passing (100% pass rate)
- Enhanced CLI with watch mode support for improved developer experience
- Updated documentation: `docs/39-compiler-options.md`, `docs/03-quick-start.md`, and README.md

## [January 2, 2026]

### Fixed

- Multiple compiler bugs related to enum handling, type resolution, and code generation
- See BUGS.md for complete list of fixed issues (BUG-001 through BUG-103)

### Documentation

- Comprehensive BUGS.md tracking all discovered issues with status and reproduction steps
- Updated README.md with current test counts
- Complete language documentation in docs/ directory (56 documentation files)
- AGENTS.MD with coding assistant instructions for contributors

### Testing

- 1,342 passing tests across 89 test files
- Integration test suite covering all language features
- Unit tests for compiler components (lexer, parser, type checker, code generator)
- Fuzz testing for compiler stability

## Project Overview

**BPL (Best Programming Language)** is a statically-typed, compiled programming language that transpiles to LLVM IR, combining performance and control of systems languages with modern language features.

### Key Features

- LLVM backend with world-class optimization
- Strong static typing with generics and type inference
- Object-oriented with structs, methods, and inheritance
- Module system with package manager
- Exception handling (try/catch)
- Pattern matching and enum types
- Inline assembly support
- Cross-platform compilation
- Built-in code formatter
- VS Code extension with LSP

### Status

The compiler is production-ready with comprehensive test coverage and documentation. Active development continues with new features and optimizations.
