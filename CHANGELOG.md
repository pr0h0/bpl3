# Changelog

All notable changes to the BPL compiler project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

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
- Comprehensive bash and zsh shell completions for all commands
- Updated test utilities to use new `run` command
- Enhanced `cmp.sh` script to use `bpl run` internally

### Changed

- **BREAKING**: Removed `--run` flag from main command (use `bpl run` instead)
- **BREAKING**: Removed `--watch` flag from main command (use `bpl dev` instead)
- **BREAKING**: Changed `-g` flag from global to `-d` for DWARF debug info
- Main command now focused on basic compilation (file → LLVM IR)
- Updated all test files (16 files) to use `bpl run` command
- All compilation workflows now use dedicated commands for clarity
- Enhanced `processCode` function signature to include `sourceLabel` parameter
- Improved CLI architecture with better separation of concerns

### Documentation

- Updated README.md with comprehensive CLI command reference
- Rewrote `docs/39-compiler-options.md` with command-first structure
- Updated `docs/03-quick-start.md` to use `bpl run` command
- Added complete examples for all new commands and flags
- Documented optimization levels, debug options, and cross-compilation
- Added workflow examples for development, production, and CI/CD

### Fixed

- Flag conflicts between main program and subcommands resolved
- Commander.js parent option inheritance issues fixed
- Restored `--eval` and `--stdin` flags for direct code execution
- Type definitions for all new CLI options in `cli/types.ts`

## [Previous Release]

### Added

- **Watch Mode** (`-w, --watch` flag) for automatic recompilation on file changes
  - Monitors all `.bpl` files in directory tree for changes
  - Automatic recompilation with 100ms debouncing to prevent excessive builds
  - Error recovery: continues watching even after compilation failures
  - Smart filtering: ignores `node_modules`, `.git`, `bpl_modules`, and hidden directories
  - Colorized console output with timestamps and status indicators
  - Works with `--run` flag for automatic execution after successful compilation
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
