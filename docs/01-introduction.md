# Introduction to BPL

## What is BPL?

**BPL (Best Programming Language)** is a statically-typed, compiled programming language that transpiles to LLVM IR (Intermediate Representation). It combines the performance of low-level languages with modern programming language features, making it ideal for systems programming, performance-critical applications, and educational purposes.

BPL uses `frame` as its keyword for functions, `local` and `global` for variable declarations, and provides powerful features like generics, pattern matching with `match`, and algebraic data types through `enum`.

## Key Features

### 🚀 Performance

- **Compiles to LLVM IR** - Leverages LLVM's world-class optimization pipeline
- **Zero-cost abstractions** - High-level features compile to efficient machine code with no runtime overhead
- **Manual memory management** - Direct control over allocations using `malloc`/`free` or custom allocators
- **Native code generation** - Produces highly optimized machine code for your target platform
- **Inline assembly support** - Drop down to assembly when you need maximum control

### 🔒 Type Safety

- **Strong static typing** - Catch errors at compile-time before they become runtime bugs
- **Type inference** - Less verbose code without sacrificing safety
- **Generics** - Write reusable, type-safe code with `<T>` syntax
- **Option types** - Handle nullable values safely with `Option<T>` enum
- **Runtime nullptr protection** - Automatic `NullAccessError` exceptions when dereferencing nullptr

### 🏗️ Modern Language Features

- **Object-Oriented Programming** - Structs with methods and single inheritance
- **Generic Programming** - Parameterized types and functions with monomorphization
- **Module System** - Organize code with `import`/`export` statements
- **Pattern Matching** - Powerful `match` expressions with guards and destructuring
- **Exception Handling** - `try`/`catch`/`throw` blocks for robust error management
- **Lambda Expressions** - First-class anonymous functions with closures
- **String Interpolation** - Embed expressions in strings with backticks and `${expr}`
- **Algebraic Data Types** - Define sum types with `enum` and pattern match on variants

### 🛠️ Developer Experience

- **Clear error messages** - Helpful compiler diagnostics with source locations
- **Built-in formatter** - Consistent code style with `bpl format`
- **Package manager** - Easy dependency management with `bpl.json`
- **Cross-platform** - Compile for Linux, macOS, Windows, and more
- **VS Code integration** - Syntax highlighting, IntelliSense, and error diagnostics
- **Watch mode** - Automatically recompile on file changes with `bpl watch`

## Why Choose BPL?

### For Systems Programming

BPL provides low-level control similar to C/C++:

- Direct memory manipulation through pointers (`*T`, `&value`, `*ptr`)
- Inline assembly support with Intel, AT&T, and LLVM IR flavors
- No garbage collector overhead - you control when memory is allocated and freed
- Predictable performance characteristics with no hidden runtime costs
- C ABI compatibility for easy FFI integration

### For Application Development

BPL offers modern conveniences:

- Generics for type-safe collections (`Array<T>`, `Map<K, V>`)
- Exception handling with `try`/`catch`/`throw` for robust error management
- Module system with `import`/`export` for clean code organization
- Rich standard library including I/O, strings, collections, math, and more
- Lambda expressions and closures for functional programming patterns

### For Learning

BPL is excellent for education:

- Simple, consistent syntax with clear keywords (`frame`, `local`, `struct`)
- Clear compilation model (source → LLVM IR → native code)
- Explicit memory management teaches fundamentals without hiding complexity
- Comprehensive error messages with source locations guide learning
- Small language specification makes it easy to understand the whole language

## Design Philosophy

### Explicit Over Implicit

BPL favors clarity and explicitness:

- Variables must be declared as `local` or `global`
- Types are usually explicit (with inference where beneficial)
- Memory allocation is manual and visible
- No hidden conversions or implicit type coercions
- The `cast<T>` operator makes type conversions explicit

### Safety Without Compromise

BPL provides safety features without sacrificing performance:

- Static type checking at compile-time prevents many runtime bugs
- Runtime nullptr protection throws `NullAccessError` on invalid access
- Optional bounds checking for array access
- Nullable types through `Option<T>` enum encourage explicit handling
- Pattern matching ensures exhaustive case handling

### Simplicity and Consistency

BPL keeps the language small and consistent:

- Few keywords and constructs to learn
- Regular syntax patterns throughout the language
- Predictable, unsurprising behavior
- Minimal "magic" - what you write is what you get

## Language Overview

Here's a quick taste of BPL syntax:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

# Define a struct with methods
struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point {
        return Point { x: x, y: y };
    }

    frame distance(this: *Point) ret float {
        return sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}

# Generic enum for optional values
enum Option<T> {
    Some(T),
    None,
}

# Main entry point
frame main() ret int {
    local p: Point = Point.new(3, 4);
    printf("Distance: %f\n", p.distance());

    # Pattern matching
    local opt: Option<int> = Option<int>.Some(42);
    match (opt) {
        Option<int>.Some(val) => printf("Value: %d\n", val),
        Option<int>.None => printf("No value\n"),
    };

    # String interpolation
    local msg: String = `Point is at (${p.x}, ${p.y})`;
    printf("%s\n", msg.toString());
    msg.destroy();

    return 0;
}
```

## Comparison with Other Languages

### vs C

**Similarities:**

- Manual memory management
- Pointers and low-level control
- Compiles to native code

**Improvements:**

- Modern type system with generics
- Built-in module system
- Exception handling
- Safer nullptr handling

### vs C++

**Similarities:**

- Object-oriented features
- Generic programming
- High performance

**Differences:**

- Simpler syntax (no templates, limited operator overloading)
- No implicit constructors/destructors
- More explicit memory management
- Smaller language specification

### vs Rust

**Similarities:**

- Memory safety focus
- Modern type system
- Zero-cost abstractions

**Differences:**

- Manual memory management (no borrow checker yet)
- Simpler ownership model
- Less complex type system
- Easier learning curve

### vs Go

**Similarities:**

- Simple syntax
- Modern tooling
- Fast compilation

**Differences:**

- No garbage collector
- Manual memory management
- Generics with monomorphization
- More low-level control

## When to Use BPL

### ✅ Good Use Cases

- **Systems programming** - Operating systems, drivers, embedded systems
- **Performance-critical applications** - Game engines, simulations, scientific computing
- **CLI tools** - Fast startup, small binaries
- **Learning compilers and systems** - Clear compilation model
- **Projects requiring C interop** - Easy FFI

### ⚠️ Consider Alternatives For

- **Web development** - Use JavaScript/TypeScript
- **Rapid prototyping** - Use Python or Ruby
- **Large teams new to systems programming** - Consider Rust or Go
- **Projects requiring garbage collection** - Use Go, Java, or C#

## Getting Help

- **Documentation** - You're reading it! Start with [Quick Start](03-quick-start.md)
- **Examples** - See the [examples directory](../examples/)
- **GitHub Issues** - Report bugs or request features
- **Community** - Join discussions (link to be added)

## What's Next?

Ready to get started? Continue to:

1. [Installation Guide](02-installation.md) - Set up your development environment
2. [Quick Start](03-quick-start.md) - Write your first BPL program
3. [Syntax and Comments](04-syntax-comments.md) - Learn the basics

---

**Note**: BPL is under active development. Features and syntax may evolve. Check the [CHANGELOG](../CHANGELOG.md) for updates.
