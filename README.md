# BPL (Best Programming Language) v3

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**BPL** is a statically-typed, compiled programming language that transpiles to LLVM IR. It combines the performance and control of systems languages with modern language features, making it ideal for performance-critical applications, systems programming, and educational purposes.

```bpl
import [IO] from "std/io.bpl";

struct Point {
    x: int,
    y: int
}

frame main() ret int {
    local p: Point;
    p.x = 10;
    p.y = 20;
    IO.log("Hello from BPL!");
    return 0;
}
```

## ✨ Features

### 🚀 Performance First

- **LLVM Backend**: Leverages LLVM's world-class optimization and code generation
- **Zero-Cost Abstractions**: High-level features without runtime overhead
- **Manual Memory Management**: Direct control over allocations for predictable performance
- **Native Compilation**: Produces optimized machine code for your platform

### 🔒 Type Safety

- **Strong Static Typing**: Catch errors at compile-time before they become runtime bugs
- **Generics**: Write reusable, type-safe code with full monomorphization
- **No Null Dereferences**: Explicit null handling patterns
- **Type Inference**: Less verbose where it matters, explicit where it helps

### 🏗️ Modern Language Features

- **Object-Oriented**: Structs with methods, single and multiple inheritance
- **Module System**: Organize code with imports and exports
- **Exception Handling**: Try/catch blocks for robust error management
- **Pattern Matching**: Type-safe conditional logic
- **Process execution**: Execute shell commands, check status, and capture output with automatic injection protection
- **String Interpolation**: Embed expressions in strings with `` `Hello ${name}` ``
- **Tuples**: Multi-value types for clean APIs
- **Function Pointers**: First-class functions

### 🛠️ Developer Experience

- **Clear Error Messages**: Helpful compiler diagnostics with exact source-span underlines
- **Machine-Readable Diagnostics**: JSON output for `check`, `lint`, and `doctor` with stable source ranges, source previews, and underline pointers for CI and editors
- **Enhanced Runtime Errors**: Beautiful formatted error boxes with stack traces for null access, bounds checking, division by zero, and signed integer division overflow
- **Built-in Formatter**: Automatic code formatting and `format --check` for CI gates
- **Watch Mode**: Automatic recompilation on file changes for rapid development
- **Package Manager**: Easy dependency management with `bpl install`
- **Cross-Platform**: Compile for Linux, macOS, Windows, ARM, and more
- **VS Code Extension**: Full language server with IntelliSense, go-to-definition, hover tooltips, clickable imports, and smart stdlib path completions
- **Incremental Compilation**: Fast rebuilds with module caching

## 📦 Installation

### Build from Source

```bash
git clone https://github.com/pr0h0/bpl3.git
cd bpl3
./init.sh
bpl --version
```

### Prerequisites

You'll need:

1. **Clang/LLVM** (13+) - for compiling LLVM IR to native code
2. **Bun** - for running the compiler

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install clang llvm lld
curl -fsSL https://bun.sh/install | bash
```

**macOS:**

```bash
brew install llvm lld
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
Download LLVM from [releases.llvm.org](https://releases.llvm.org/) or use WSL.

### Verify Installation

```bash
bpl --version
echo 'extern printf(fmt: string, ...); frame main() ret int { printf("It works!\n"); return 0; }' > test.bpl
bpl run test.bpl
```

For detailed installation instructions, see the [Installation Guide](docs/02-installation.md).

### Release Verification

Before publishing a local build or npm tarball, run:

```bash
bun run release:check
bun run release:manifest
```

The release check builds and tests the standalone compiler, packed CLI, runtime
artifacts, wasm runtime shims, shell completions, documentation, example
configs, and VS Code extension. The manifest command writes
`dist/release-manifest.json` with SHA-256 checksums for shipped artifacts.

Packed npm helper scripts supported from installed packages:

```bash
npm run fuzz:repro -- --help
npm run fuzz -- --help
npm run fuzz:replay -- --help
npm run fuzz:promote -- --help
npm run ci:triage -- --help
npm run ci:triage -- --json --jobs-json jobs.json <run-id>
```

The packed `fuzz`, `fuzz:replay`, and `fuzz:promote` scripts validate usage in
installed packages before delegating to source-tree fuzz helpers when a checkout
is present. The package intentionally excludes source-only files such as
`playground/examples/70-browser-wasm-showcase.json`, `tests/`, `fuzz/`, and
broad compiler sources. The narrow exception is
`compiler/common/PathSafety.ts`, which is shipped because packed helper scripts
share its symlink-safe path validation.
Release metadata checks derive the helper inventory from `package.json` scripts
so new `bun tools/*.ts` npm scripts must be shipped or fail with the referencing
script name.
Packed `ci:triage` smoke also validates timeout repro contracts for package
tooling, package IR verification, and object symbol parsing:

```bash
BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts
BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"
BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts
```

It also validates representative JSON-code mapping repros from the packed
helper path, including package archive validation and wasm linker diagnostics.

Packed `ci:triage` smoke also validates sanitizer runtime repro contracts:

```bash
bun run test:sanitizers
bun test tests/CompilerSanitizerRuntime.test.ts
```

Packed package/import diagnostic smoke validates that the installed npm CLI
keeps package import JSON diagnostics machine-readable, including stable
diagnostic codes such as `BPL_PACKAGE_MANIFEST_MISSING`. Reproduce that release
slice locally with:

```bash
bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"
bun run release:smoke
```

## 🚀 Quick Start

### Hello World

Create `hello.bpl`:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    printf("Hello, World!\n");
    return 0;
}
```

Compile and run:

```bash
bpl run hello.bpl
```

Or just compile:

```bash
bpl hello.bpl -o hello
```

### Compile code without a file

You can compile snippets or piped input directly:

- Compile a snippet from the command line:

  ```bash
  bpl -e 'frame main() ret int { return 0; }'
  ```

- Compile from stdin (helpful with `cat`/pipes):

  ```bash
  cat examples/hello-world/main.bpl | bpl --stdin
  ```

`--emit tokens|ast|formatted|llvm` works with both `-e` and `--stdin`; diagnostics show `<eval>`/`<stdin>` in locations.

### More Examples

**Variables and Types:**

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 42;
    local name: string = "BPL";
    local pi: float = 3.14159;

    printf("%s: x = %d, pi = %f\n", name, x, pi);
    return 0;
}
```

**Functions:**

```bpl
extern printf(fmt: string, ...);

frame add(a: int, b: int) ret int {
    return a + b;
}

frame main() ret int {
    local result: int = add(5, 3);
    printf("5 + 3 = %d\n", result);
    return 0;
}
```

**Structs and Methods:**

```bpl
extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }

    frame print(this: Point) ret void {
        printf("Point(%d, %d)\n", this.x, this.y);
    }
}

frame main() ret int {
    local p: Point = Point.new(10, 20);
    p.print();
    return 0;
}
```

**Generics:**

```bpl
extern printf(fmt: string, ...);

struct Box<T> {
    value: T,

    frame new(val: T) ret Box<T> {
        local b: Box<T>;
        b.value = val;
        return b;
    }
}

frame main() ret int {
    local intBox: Box<int> = Box<int>.new(42);
    local floatBox: Box<float> = Box<float>.new(3.14);

    printf("Int: %d, Float: %f\n", intBox.value, floatBox.value);
    return 0;
}
```

**Using Standard Library:**

```bpl
import [Array] from "std/array.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    local numbers: Array<int> = Array<int>.new(5);
    numbers.push(10);
    numbers.push(20);
    numbers.push(30);

    IO.log("Vector contents:");
    local i: int = 0;
    loop (i < numbers.len()) {
        IO.printIntLn(numbers.get(i));
        i = i + 1;
    }

    numbers.destroy();
    return 0;
}
```

For more examples, check out the [examples](examples/) directory or the [Quick Start Guide](docs/03-quick-start.md).

## 📖 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

### Getting Started

- **[Introduction](docs/01-introduction.md)** - What is BPL and why use it?
- **[Installation](docs/02-installation.md)** - Setup guide for all platforms
- **[Quick Start](docs/03-quick-start.md)** - Write your first program in 5 minutes

### Core Concepts

- **[Syntax and Comments](docs/04-syntax-comments.md)** - Basic syntax rules
- **[Types and Variables](docs/05-types-variables.md)** - Type system and declarations
- **[Operators](docs/06-operators.md)** - All operators explained
- **[Control Flow](docs/07-control-flow.md)** - If, loop, switch statements
- **[Functions](docs/08-functions-basics.md)** - Declaring and calling functions
- **[Structs](docs/11-structs.md)** - Custom data types
- **[Generics](docs/10-generics-functions.md)** - Generic programming

### Advanced Topics

- **[Pointers](docs/15-pointers.md)** - Memory manipulation
- **[Arrays and Tuples](docs/16-arrays.md)** - Collections
- **[Inheritance](docs/13-inheritance.md)** - OOP in BPL
- **[Module System](docs/23-imports-exports.md)** - Organizing code
- **[Error Handling](docs/26-try-catch.md)** - Exception handling
- **[Standard Library](docs/28-stdlib-io.md)** - Built-in functionality

### Reference

- **[Language Specification](LANGUAGE_SPEC.md)** - Formal specification
- **[CLI Reference](docs/39-compiler-options.md)** - All command-line options
- **[Standard Library API](docs/48-stdlib-api.md)** - Complete API reference

## 💻 Command Line Interface

### Quick Reference

```bash
# Compile and run a program
bpl run main.bpl

# Development mode with watch and auto-run
bpl dev main.bpl

# Build an executable
bpl build main.bpl -o myprogram

# Type check without code generation (fast)
bpl check main.bpl

# Create a new project
bpl new my-project

# Format code
bpl format main.bpl -w

# Clean build artifacts
bpl clean
```

### Core Commands

#### `bpl run <file> [args...]`

Compile and execute a BPL program in one step:

```bash
# Run a program
bpl run main.bpl

# Pass arguments to the program
bpl run main.bpl arg1 arg2

# Run with optimization
bpl run main.bpl -O 2

# Run with timing statistics
bpl run main.bpl --time
```

#### `bpl dev <file> [args...]`

Development mode with automatic recompilation and execution:

```bash
# Watch and run on changes
bpl dev main.bpl

# Clear screen on each recompile
bpl dev main.bpl --clear

# Watch but only compile (don't run)
bpl dev main.bpl --no-run
```

#### `bpl build <file>`

Explicitly compile a program:

```bash
# Basic compilation (generates LLVM IR)
bpl build main.bpl

# Specify output filename
bpl build main.bpl -o myprogram

# Verbose output
bpl build main.bpl -v

# Enable incremental compilation
bpl build main.bpl --cache
```

#### `bpl check <files...>`

Fast type checking without code generation:

```bash
# Check a single file
bpl check main.bpl

# Check multiple files
bpl check src/*.bpl

# JSON output for tooling
bpl check main.bpl --json
```

#### `bpl new <name>`

Create a new BPL project with standard structure:

```bash
# Create new project
bpl new my-project
cd my-project
bpl run main.bpl
```

This creates:

- `bpl.json` - Package manifest
- `main.bpl` - Entry point with Hello World
- `lib/` - Local library directory
- `README.md` - Project documentation
- `.gitignore` - Git ignore rules

#### `bpl clean`

Remove build artifacts. In git repositories, tracked files are preserved even
when they live in `build/`, `dist/`, or `.bpl-cache/`. `--json` reports each
planned deletion as a `file`, `directory`, or `symlink`.

```bash
# Remove all build artifacts
bpl clean

# Dry run (show what would be deleted)
bpl clean --dry-run

# Verbose output
bpl clean -v
```

### Compilation Options

#### Global Flags

These work with any command:

```bash
-v, --verbose          Enable verbose output
-q, --quiet            Suppress non-error output
-O <level>             Optimization level: 0, 1, 2, or 3
--debug, -d            Generate DWARF debug information
--time                 Show compilation time statistics
--cache                Enable incremental compilation
--color/--no-color     Force/disable colored output
--json                 Output in JSON format (for check command)
```

### Emit Options

Control what the compiler outputs:

```bash
# Emit LLVM IR (default)
bpl build main.bpl --emit llvm

# Emit AST as JSON
bpl build main.bpl --emit ast

# Emit tokens
bpl build main.bpl --emit tokens

# Format source code
bpl format main.bpl
```

### Cross-Compilation

Compile for different platforms and architectures:

```bash
# Cross-compile for ARM64 Linux
bpl build main.bpl --target aarch64-unknown-linux-gnu --march=armv8-a

# Cross-compile for Windows x64
bpl build main.bpl --target x86_64-pc-windows-gnu

# Cross-compile for macOS ARM64
bpl build main.bpl --target arm64-apple-darwin

# Specify sysroot for cross-compilation
bpl build main.bpl --target aarch64-unknown-linux-gnu --sysroot /opt/sysroots/aarch64

# Pass additional flags to clang
bpl build main.bpl --clang-flag=-O3 --clang-flag=-static
```

**Supported target triples:**

- `x86_64-pc-linux-gnu` (Linux x64)
- `aarch64-unknown-linux-gnu` (Linux ARM64)
- `arm64-apple-darwin` (macOS ARM64)
- `x86_64-apple-darwin` (macOS x64)
- `x86_64-pc-windows-gnu` (Windows x64)

### Code Formatting

```bash
# Format and print to stdout
bpl format main.bpl

# Format and write back to file
bpl format -w main.bpl

# Format multiple files
bpl format -w src/**/*.bpl
```

### Package Management

```bash
# Initialize a new project
bpl init my-project

# Scaffold a new app project with machine-readable output
bpl new my-project --no-git --json

# Create a package tarball
bpl pack

# Install a package
bpl install package-name-1.0.0.tgz

# Install all dependencies from bpl.json
bpl install

# List installed packages
bpl list

# Uninstall a package
bpl uninstall package-name
```

See the [Package Management Guide](docs/25-package-management.md) for details.

### Shell Completion

BPL provides command-line completion for Bash and Zsh shells:

```bash
# Generate Bash completion script
bpl completion bash > ~/.local/share/bash-completion/completions/bpl

# Or add to your ~/.bashrc:
source <(bpl completion bash)

# Generate Zsh completion script
mkdir -p ~/.local/share/zsh/completions
bpl completion zsh > ~/.local/share/zsh/completions/_bpl

# Add to ~/.zshrc:
fpath=(~/.local/share/zsh/completions $fpath)

# Reload completions
rm -f ~/.zcompdump; compinit
```

After installation, you can use Tab to complete commands, flags, and file paths!

## 🌟 Language Highlights

### Type System

BPL features a rich, safe type system:

- **Primitive types**: `int`, `float`, `bool`, `char`
- **Composite types**: pointers, arrays, tuples
- **User-defined types**: structs with fields and methods
- **Generics**: Type parameters for functions and structs
- **Type aliases**: Create meaningful names for complex types

```bpl
type UserID = int;
type Callback = Func<void>(int);
type Point3D = (float, float, float);

struct Result<T, E> {
    ok: T,
    err: E,
    is_ok: bool
}
```

### Memory Management

Manual memory management with safety helpers:

```bpl
extern malloc(size: i64) ret *void;
extern free(ptr: *void);

frame main() ret int {
    # Allocate
    local ptr: *int = cast<*int>(malloc(sizeof(int) * 10));

    # Use
    ptr[0] = 42;

    # Free
    free(cast<*void>(ptr));

    return 0;
}
```

### Inheritance

Single and multiple inheritance supported:

```bpl
struct Animal {
    name: string,
    frame speak() { printf("...\n"); }
}

struct Dog : Animal {
    breed: string,
    frame speak() { printf("Woof!\n"); }  # Override
}

struct Bird : Animal {
    wingspan: float
}

# Multiple inheritance
struct Platypus : Animal, Swimmer {
    # ...
}
```

### Module System

Organize code across files:

```bpl
# math.bpl
export add, multiply;

frame add(a: int, b: int) ret int {
    return a + b;
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}
```

```bpl
# main.bpl
import add, multiply from "./math.bpl";

frame main() ret int {
    local sum: int = add(5, 3);
    local product: int = multiply(5, 3);
    return 0;
}
```

## 🔧 Standard Library

BPL includes a comprehensive standard library:

| Module           | Description             | Example               |
| ---------------- | ----------------------- | --------------------- |
| `std/io.bpl`     | Input/output operations | `IO.log("Hello")`     |
| `std/string.bpl` | String manipulation     | `String.new("text")`  |
| `std/array.bpl`  | Dynamic arrays          | `Array<int>.new(10)`  |
| `std/map.bpl`    | Hash maps               | `Map<K, V>.new()`     |
| `std/set.bpl`    | Hash sets               | `Set<T>.new()`        |
| `std/fs.bpl`     | File system ops         | `FS.readFile(path)`   |
| `std/math.bpl`   | Math functions          | `Math.sqrt(x)`        |
| `std/time.bpl`   | Time operations         | `Time.now()`          |
| `std/json.bpl`   | JSON parsing            | `JSON.parse<T>(str)`  |
| `std/option.bpl` | Optional values         | `Option<T>.Some(val)` |
| `std/result.bpl` | Error handling          | `Result<T, E>`        |

See the [Standard Library documentation](docs/28-stdlib-io.md) for complete API reference.

## 📁 Project Structure

```
bpl3/
├── compiler/           # Compiler implementation
│   ├── frontend/       # Lexer (Peggy) and parser
│   ├── middleend/      # Type checker, module resolver, linker
│   ├── backend/        # LLVM IR code generation
│   │   └── codegen/    # Generators for expressions, types, etc.
│   ├── formatter/      # Code formatter
│   ├── linter/         # Code linting
│   ├── docs/           # Documentation generator
│   └── common/         # Shared utilities
│       ├── AST.ts      # AST definitions
│       ├── CompilerError.ts # Error handling
│       ├── Config.ts   # Centralized configuration
│       ├── Logger.ts   # Structured logging
│       └── ...         # Path resolution, source management
├── cli/                # Command-line interface
│   ├── index.ts        # CLI entry point
│   ├── commands/       # Subcommand handlers
│   └── completions/    # Shell completions
├── docs/               # Comprehensive documentation
│   ├── 01-introduction.md
│   ├── 02-installation.md
│   ├── 03-quick-start.md
│   └── ...             # 70+ documentation files
├── examples/           # 450+ examples and regression programs
│   ├── hello-world/
│   ├── fibonacci/
│   ├── generics/
│   ├── stdlib_*/       # Standard library examples
│   └── ...
├── grammar/            # PEG grammar definitions
│   └── bpl.peggy       # Language grammar
├── lib/                # Standard library
│   ├── io.bpl          # Input/output
│   ├── array.bpl       # Dynamic arrays
│   ├── map.bpl         # Hash maps
│   ├── string.bpl      # String utilities
│   └── ...             # 50+ stdlib modules
├── tests/              # Comprehensive test suite
│   ├── Integration.test.ts
│   ├── Parser.test.ts
│   └── ...
├── benchmark/          # Performance benchmarks
├── vscode-ext/         # VS Code extension
├── playground/         # Web playground (optional)
├── index.ts            # Main entry point
├── LANGUAGE_SPEC.md    # Language specification
└── README.md           # This file
```

## 🧪 Examples

The [`examples/`](examples/) directory contains 450+ working examples and regression programs demonstrating language features and compiler edge cases:

### Beginner Examples

- `hello-world/` - Your first program
- `assignment_variations/` - Variable declarations and assignment forms
- `float_operations/` - Floating-point arithmetic
- `control_flow_if_complex/` - Conditionals
- `loops/` - Loop constructs

### Intermediate Examples

- `func_nested_calls/` - Function definitions and calls
- `structs/` - Custom data types
- `arrays/` - Array operations
- `pointers/` - Pointer manipulation
- `stdlib_string_extended/` - String handling

### Advanced Examples

- `generics/` - Generic programming
- `generics_advanced/` - Complex generics
- `objects_inheritance/` - OOP patterns
- `multi_inheritance/` - Multiple inheritance
- `error_handling/` - Exception handling

### Standard Library Examples

- `stdlib_demo/` - I/O, arrays, strings, and stdlib basics
- `stdlib_vec/` - Dynamic arrays
- `stdlib_map_set/` - Hash maps and sets
- `stdlib_json/` - JSON parsing
- `stdlib_fs/` - File system
- `stdlib_time/` - Time operations

### Complete Applications

- `fibonacci/` - Fibonacci sequence
- `collatz/` - Collatz conjecture
- `recursive_algorithms/` - Recursion examples

Each example includes:

- Source code (`.bpl` files)
- Expected output (in test configurations)
- Build and test scripts

Run any example:

```bash
cd examples/fibonacci
bpl run main.bpl
```

## 🧑‍💻 Development

### Work Tracking

Active BPL implementation work is tracked on the project-scoped BPL Agent Board.
Use the board as the source of truth for task ownership, acceptance criteria,
progress notes, review status, and time tracking. Keep repository artifacts in
sync with the board: user-visible behavior changes should update
`CHANGELOG.md`, docs should change with documented behavior, and completed work
should include the relevant test or verification output in the board summary.

Do not commit Agent Board credentials, API keys, local environment files, or
private endpoint details. Board updates should describe the work and evidence,
not secrets.

### Running Tests

```bash
# Run the default test suite
bun run test

# Run the CI-safe broad suite. This includes integration, playground, and
# VS Code extension tests, but leaves fuzz/correctness corpora to dedicated scripts.
bun run test:ci

# Build, pack, install, and smoke-test the release package. This also discovers
# package scripts that call tools/*.ts and verifies those helper files are in the
# packed npm tarball.
bun run release:smoke

# Run the focused packed-helper sweep without the full release package smoke.
bun test tests/ReleaseHelperSmoke.test.ts

# Summarize a GitHub Actions run and print local repro commands for failed steps.
bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>
# If a failed job prints "No focused local repro command matched this job",
# inspect the failed step logs and add a ci:triage mapping when the failure
# pattern is recurring.
# Print versioned JSON from a saved GitHub jobs API response without network.
bun run ci:triage -- --json --jobs-json jobs.json <run-id>
# Print CI triage usage without making a GitHub API request.
bun run ci:triage -- --help
# Wasm/toolchain failures include required-linker mode and doctor diagnostics.
bun index.ts doctor --json

# Run only the VS Code extension tests
bun run test:vscode-ext

# Run parser/typechecker/codegen tests that are safe on Windows runners.
# This validates documented target triples without native runtime execution.
bun run test:codegen-cross-platform

# Run compiler correctness and deterministic fuzz regression coverage
bun run test:correctness

# Run standalone/hosted WebAssembly runtime and toolchain contract coverage
bun run test:wasm
# CI sets BPL_REQUIRE_WASM_LD=1 so this fails instead of skipping when wasm-ld is missing.
BPL_REQUIRE_WASM_LD=1 bun run test:wasm

# Start the playground. The Run Wasm button compiles hosted wasm and executes it
# in the browser with JavaScript host imports.
cd playground && bun run start

# Run sanitizer-backed runtime checks. CI installs compiler-rt so this runs
# safe programs and checked failure paths under ASan/UBSan; local toolchains
# without sanitizer runtimes are detected.
bpl doctor sanitizer --json
bun run test:sanitizers
SANITIZER_RUNTIME_TEST_TIMEOUT_MS=30000 bun test tests/CompilerSanitizerRuntime.test.ts

# Run a short deterministic O0/O3 differential fuzz campaign. Differential
# inputs include successful programs and checked BPL runtime failures.
bun run fuzz:differential

# Validate saved active fuzz failures under tests/fuzz-failure-artifacts
bun run fuzz:validate-artifacts

# Print local replay/minimize/promote commands for downloaded scheduled fuzz artifacts
bun run fuzz:repro -- fuzz/crashes

# Save minimized fuzz artifacts while running a campaign
FUZZ_MINIMIZE=1 FUZZ_MINIMIZE_PASSES=8 bun run fuzz:differential

# Replay one artifact through parser, typechecker, codegen, runtime,
# O0/O3 differential, and sanitizer modes
bun run fuzz:replay -- --metadata fuzz/crashes/mismatch_seed-...json --mode parser,typecheck,codegen,runtime,differential,sanitizer

# Run specific test file
bun test tests/Integration.test.ts

# Run tests matching pattern
bun test -t "generics"
```

### Type Checking

```bash
# Check TypeScript types
bun run check
```

### Building the Compiler

```bash
# Build executable
bun run build

# Development mode (no build)
bun index.ts run examples/hello-world/main.bpl
```

### Contributing

Contributions are welcome! Please:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Run tests** (`bun test`)
5. **Format code** (`bun run format`)
6. **Commit** (`git commit -m 'Add amazing feature'`)
7. **Push** (`git push origin feature/amazing-feature`)
8. **Open a Pull Request**

Open a pull request after running the relevant tests and type checks.

## 🎓 Learning Resources

### Documentation

- Start with the [Quick Start Guide](docs/03-quick-start.md)
- Read the [Language Specification](LANGUAGE_SPEC.md)
- Explore [example programs](examples/)
- Check the [Standard Library docs](docs/28-stdlib-io.md)

### Video Tutorials

Coming soon!

### Community

- **GitHub Discussions** - Ask questions, share projects
- **GitHub Issues** - Report bugs, request features
- **Discord** - Real-time chat (link coming soon)

## 🚦 Roadmap

### Current Status: Beta

BPL is under active development. The compiler has **1,300+ tests** across 140+ test files, plus hundreds of example and regression programs.

**Build Status:**

- ✅ 1,300+ tests in the checked-in test suite
- ✅ CI-safe suite includes integration tests, all playground examples, and VS Code extension tests
- ✅ 0 ESLint errors/warnings
- ✅ 0 TypeScript errors
- ✅ 450+ checked-in examples and regression programs

### Completed ✅

- [x] Full LLVM IR backend
- [x] Static type system with generics
- [x] Structs with inheritance
- [x] Module system with imports/exports
- [x] Exception handling (try/catch)
- [x] Package manager
- [x] Code formatter
- [x] Cross-compilation support
- [x] Standard library (50+ modules)
- [x] VS Code extension
- [x] Comprehensive test suite (1,300+ tests)
- [x] Documentation (70+ pages)
- [x] Enum types with pattern matching
- [x] String interpolation
- [x] Lambda expressions
- [x] Tuple destructuring (including nested)
- [x] Operator overloading (24 operators)
- [x] Intrinsics (math, bit manipulation, memory)
- [x] WebAssembly target (freestanding wasm32 plus hosted runtime hooks)

### In Progress 🚧

- [ ] IDE integrations (beyond VS Code)
- [ ] More stdlib modules (networking, threads)
- [ ] Optimization passes

### Planned 📋

- [ ] Package registry
- [ ] Incremental compilation improvements
- [ ] Inline assembly improvements
- [ ] C++ interop improvements
- [ ] Self-hosting compiler

See [TODO.md](TODO.md) for detailed task list.

## 📊 Benchmarks

BPL produces C-class performance on the checked-in benchmark suite. Representative medians from a recent `--language bpl,c --runs 5` run:

| Benchmark               | BPL (-O3) | C (clang -O3) | Ratio |
| ----------------------- | --------- | ------------- | ----- |
| `bit_twiddle`           | 40.60ms   | 40.59ms       | 1.00x |
| `fibonacci_recursive`   | 289.29ms  | 317.60ms      | 0.91x |
| `matrix_multiplication` | 16.56ms   | 17.06ms       | 0.97x |
| `prime_sieve`           | 18.33ms   | 21.17ms       | 0.87x |

Run `./benchmark/run_all.sh --language bpl,c --runs 5` to refresh local numbers, or add `--json > benchmark/latest-results.json` to write ignored local JSON output.

## 🔍 Comparison with Other Languages

| Feature             | BPL    | C      | C++        | Rust     | Go     |
| ------------------- | ------ | ------ | ---------- | -------- | ------ |
| Manual memory mgmt  | ✅     | ✅     | ✅         | ✅\*     | ❌     |
| Generics            | ✅     | ❌     | ✅         | ✅       | ✅     |
| Inheritance         | ✅     | ❌     | ✅         | ❌       | ❌     |
| Exceptions          | ✅     | ❌     | ✅         | ❌       | ✅     |
| Module system       | ✅     | ❌     | ⚠️         | ✅       | ✅     |
| Package manager     | ✅     | ❌     | ⚠️         | ✅       | ✅     |
| Memory safety\*\*   | ⚠️     | ❌     | ❌         | ✅       | ✅     |
| Learning curve      | ⭐⭐   | ⭐⭐   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐   |
| Compile speed       | ⚡⚡   | ⚡⚡⚡ | ⚡         | ⚡       | ⚡⚡⚡ |
| Runtime performance | ⚡⚡⚡ | ⚡⚡⚡ | ⚡⚡⚡     | ⚡⚡⚡   | ⚡⚡   |

\*Rust uses ownership/borrowing instead of GC  
\*\*Planned for BPL

## 📝 License

BPL is licensed under the **Apache License 2.0**.

See [LICENSE](LICENSE) for details.

## 👤 Author

**pr0h0**

- GitHub: [@pr0h0](https://github.com/pr0h0)
- Email: contact via GitHub

## 🙏 Acknowledgments

- **LLVM Project** - For the amazing compiler infrastructure
- **Bun** - For the fast JavaScript runtime
- **Community Contributors** - For bug reports and feature requests

## 📞 Support

Need help?

1. **Documentation** - Check the [docs/](docs/) directory
2. **Examples** - Browse [examples/](examples/)
3. **Issues** - Search or create a [GitHub Issue](https://github.com/pr0h0/bpl3/issues)
4. **Discussions** - Join [GitHub Discussions](https://github.com/pr0h0/bpl3/discussions)

## 🔗 Links

- **GitHub Repository**: https://github.com/pr0h0/bpl3
- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)
- **Language Spec**: [LANGUAGE_SPEC.md](LANGUAGE_SPEC.md)

---

**Happy Coding! 🚀**

_BPL - Where performance meets modern language design_
