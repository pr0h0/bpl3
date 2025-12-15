# BPL (Best Programming Language) v3

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/the-best-programming-language-v3)](https://www.npmjs.com/package/the-best-programming-language-v3)

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
- **Tuples**: Multi-value types for clean APIs
- **Function Pointers**: First-class functions

### 🛠️ Developer Experience

- **Clear Error Messages**: Helpful compiler diagnostics with location information
- **Built-in Formatter**: Automatic code formatting for consistent style
- **Package Manager**: Easy dependency management with `bpl install`
- **Cross-Platform**: Compile for Linux, macOS, Windows, ARM, and more
- **Editor Integration**: VS Code extension with syntax highlighting
- **Incremental Compilation**: Fast rebuilds with module caching

## 📦 Installation

### Quick Install

```bash
# Using npm
npm install -g the-best-programming-language-v3

# Using Bun (recommended)
bun install -g the-best-programming-language-v3
```

### Prerequisites

You'll need:

1. **Clang/LLVM** (11+) - for compiling LLVM IR to native code
2. **Bun** or **Node.js** (16+) - for running the compiler

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install clang llvm
curl -fsSL https://bun.sh/install | bash
```

**macOS:**

```bash
brew install llvm
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
Download LLVM from [releases.llvm.org](https://releases.llvm.org/) or use WSL.

### Build from Source

```bash
git clone https://github.com/pr0h0/bpl3.git
cd bpl3
bun install
bun run build
# ./bpl is now available
```

### Verify Installation

```bash
bpl --version
echo 'extern printf(fmt: string, ...); frame main() ret int { printf("It works!\n"); return 0; }' > test.bpl
bpl test.bpl --run
```

For detailed installation instructions, see the [Installation Guide](docs/02-installation.md).

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
bpl hello.bpl --run
```

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
import [Vec] from "std/vec.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    local numbers: Vec<int> = Vec<int>.new(5);
    numbers.push(10);
    numbers.push(20);
    numbers.push(30);

    IO.log("Vector contents:");
    local i: int = 0;
    loop (i < numbers.len()) {
        IO.printInt(numbers.get(i));
        i = i + 1;
    }

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

### Compilation Options

```bash
# Basic compilation (generates LLVM IR)
bpl main.bpl

# Compile and run immediately
bpl main.bpl --run

# Specify output filename
bpl main.bpl -o myprogram

# Verbose output
bpl main.bpl -v

# Enable incremental compilation
bpl main.bpl --cache --run
```

### Emit Options

```bash
# Emit LLVM IR (default)
bpl main.bpl --emit llvm

# Emit AST as JSON
bpl main.bpl --emit ast

# Emit tokens
bpl main.bpl --emit tokens

# Emit formatted source code
bpl main.bpl --emit formatted
```

### Cross-Compilation

Compile for different platforms and architectures:

```bash
# Cross-compile for ARM64 Linux
bpl main.bpl --target aarch64-unknown-linux-gnu --march=armv8-a

# Cross-compile for Windows x64
bpl main.bpl --target x86_64-pc-windows-gnu

# Cross-compile for macOS ARM64
bpl main.bpl --target arm64-apple-darwin

# Specify sysroot for cross-compilation
bpl main.bpl --target aarch64-unknown-linux-gnu --sysroot /opt/sysroots/aarch64

# Pass additional flags to clang
bpl main.bpl --clang-flag=-O3 --clang-flag=-static
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
| `std/string.bpl` | String manipulation     | `String.concat(a, b)` |
| `std/array.bpl`  | Dynamic arrays          | `Array<int>.new(10)`  |
| `std/vec.bpl`    | Growable vectors        | `Vec<int>.new(0)`     |
| `std/map.bpl`    | Hash maps               | `Map<K, V>.new()`     |
| `std/set.bpl`    | Hash sets               | `Set<T>.new()`        |
| `std/fs.bpl`     | File system ops         | `FS.readFile(path)`   |
| `std/math.bpl`   | Math functions          | `Math.sqrt(x)`        |
| `std/time.bpl`   | Time operations         | `Time.now()`          |
| `std/json.bpl`   | JSON parsing            | `JSON.parse(str)`     |
| `std/option.bpl` | Optional values         | `Option<T>.some(val)` |
| `std/result.bpl` | Error handling          | `Result<T, E>`        |

See the [Standard Library documentation](docs/28-stdlib-io.md) for complete API reference.

## 📁 Project Structure

```
bpl3/
├── compiler/           # Compiler implementation
│   ├── frontend/       # Lexer and parser
│   ├── middleend/      # Type checker, module resolver
│   ├── backend/        # LLVM IR code generation
│   ├── formatter/      # Code formatter
│   └── common/         # AST definitions, errors
├── docs/               # Comprehensive documentation
│   ├── 01-introduction.md
│   ├── 02-installation.md
│   ├── 03-quick-start.md
│   └── ...             # 50+ documentation files
├── examples/           # 70+ working examples
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
│   ├── vec.bpl         # Vectors
│   ├── map.bpl         # Hash maps
│   ├── string.bpl      # String utilities
│   └── ...             # 20+ stdlib modules
├── tests/              # Comprehensive test suite
│   ├── Integration.test.ts
│   ├── Parser.test.ts
│   └── ...
├── vscode-ext/         # VS Code extension
├── playground/         # Web playground (optional)
├── index.ts            # CLI entry point
├── LANGUAGE_SPEC.md    # Language specification
└── README.md           # This file
```

## 🧪 Examples

The [`examples/`](examples/) directory contains 70+ working examples demonstrating every language feature:

### Beginner Examples

- `hello-world/` - Your first program
- `variables/` - Variable declarations
- `math/` - Arithmetic operations
- `if-statements/` - Conditionals
- `loops/` - Loop constructs

### Intermediate Examples

- `functions/` - Function definitions
- `structs/` - Custom data types
- `arrays/` - Array operations
- `pointers/` - Pointer manipulation
- `strings/` - String handling

### Advanced Examples

- `generics/` - Generic programming
- `generics_advanced/` - Complex generics
- `objects_inheritance/` - OOP patterns
- `multi_inheritance/` - Multiple inheritance
- `error_handling/` - Exception handling

### Standard Library Examples

- `stdlib_io/` - I/O operations
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
bpl main.bpl --run
```

## 🧑‍💻 Development

### Running Tests

```bash
# Run all tests
bun test

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
bun index.ts examples/hello-world/main.bpl --run
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

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

### Current Status: Alpha

BPL is under active development. Current features are stable, but the language may evolve.

### Completed ✅

- [x] Full LLVM IR backend
- [x] Static type system with generics
- [x] Structs with inheritance
- [x] Module system with imports/exports
- [x] Exception handling (try/catch)
- [x] Package manager
- [x] Code formatter
- [x] Cross-compilation support
- [x] Standard library (20+ modules)
- [x] VS Code extension
- [x] Comprehensive test suite
- [x] Documentation (50+ pages)

### In Progress 🚧

- [ ] Ownership and borrowing system (Rust-style)
- [ ] More stdlib modules (networking, threads)
- [ ] Language server protocol (LSP)
- [ ] Debugger integration (LLDB)
- [ ] Optimization passes

### Planned 📋

- [ ] Package registry
- [ ] Incremental compilation improvements
- [ ] Inline assembly improvements
- [ ] C++ interop improvements
- [ ] WebAssembly target
- [ ] Self-hosting compiler

See [TODO.md](TODO.md) for detailed task list.

## 📊 Benchmarks

BPL produces competitive performance with C/C++:

| Benchmark             | BPL   | C (gcc -O2) | C++ (g++ -O2) |
| --------------------- | ----- | ----------- | ------------- |
| Fibonacci (recursive) | 1.23s | 1.19s       | 1.21s         |
| Array sum             | 0.45s | 0.43s       | 0.44s         |
| Matrix multiply       | 2.10s | 2.05s       | 2.08s         |

_Note: Benchmarks run on AMD Ryzen 9 5900X, Linux 5.15_

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
- **npm Package**: https://www.npmjs.com/package/the-best-programming-language-v3
- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)
- **Language Spec**: [LANGUAGE_SPEC.md](LANGUAGE_SPEC.md)

---

**Happy Coding! 🚀**

_BPL - Where performance meets modern language design_
