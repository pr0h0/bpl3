# BPL Documentation

Welcome to the comprehensive documentation for **BPL (Best Programming Language) v3**. This documentation provides in-depth information about every aspect of the language, from basic syntax to advanced features.

## Quick Links

- 🚀 [Quick Start](03-quick-start.md) - Write your first BPL program in 5 minutes
- 📚 [Language Reference](../AGENTS.MD) - Concise language reference
- 💡 [Examples](../examples/) - Real-world code examples

## Table of Contents

### Getting Started

- [Introduction](01-introduction.md) - What is BPL and why use it?
- [Installation](02-installation.md) - Setting up your development environment
- [Quick Start](03-quick-start.md) - Write your first BPL program in 5 minutes

### Language Fundamentals

- [Syntax and Comments](04-syntax-comments.md) - Basic syntax rules and comment styles
- [Types and Variables](05-types-variables.md) - Primitive types, composite types, and variable declarations
- [Operators](06-operators.md) - Arithmetic, logical, bitwise, and comparison operators
- [Control Flow](07-control-flow.md) - Conditionals, loops, switch, match, and defer
- [String Interpolation](54-string-interpolation.md) - Embedding expressions in strings with backticks

### Functions

- [Functions Basics](08-functions-basics.md) - Declaring and calling `frame`s
- [Function Parameters](09-function-parameters.md) - Parameters, return values, and variadic functions
- [Generic Functions](10-generics-functions.md) - Generic programming with type parameters
- [Lambda Expressions](53-lambdas.md) - Anonymous functions and closures

### Data Structures

- [Structs](11-structs.md) - Creating and using structures
- [Struct Methods](12-struct-methods.md) - Instance and static methods
- [Inheritance](13-inheritance.md) - Single inheritance with `:`
- [Struct Primitive Inheritance](55-struct-primitive-inheritance.md) - Inheriting from primitive types
- [Generic Structs](14-generic-structs.md) - Parameterized types with `<T>`

### Advanced Types

- [Pointers](15-pointers.md) - Memory addresses and pointer operations (`*T`, `&`)
- [Arrays](16-arrays.md) - Fixed-size and dynamic arrays
- [Tuples](17-tuples.md) - Multi-value types with destructuring
- [Type Aliases](18-type-aliases.md) - Creating custom type names with `type`
- [Function Pointers](19-function-pointers.md) - `Func<R>(P...)` and `Lambda<R>(P...)`
- [Type Matching](56-type-matching.md) - Runtime type checking with `match<Type>`, `is`, and `as`

### Memory Management

- [Memory Basics](20-memory-basics.md) - Stack vs heap allocation
- [Constructors and Destructors](21-constructors-destructors.md) - Object lifecycle
- [Manual Memory Management](22-manual-memory.md) - `malloc`, `free`, and best practices

### Module System

- [Imports and Exports](23-imports-exports.md) - Module organization with `import`/`export`
- [Module Resolution](24-module-resolution.md) - How BPL finds modules
- [Package Management](25-package-management.md) - Creating and using packages

### Error Handling

- [Try-Catch](26-try-catch.md) - Exception handling with `try`/`catch`
- [Throwing Exceptions](27-throwing-exceptions.md) - Error propagation with `throw`

### Standard Library

- [I/O Operations](28-stdlib-io.md) - Input and output
- [String Utilities](29-stdlib-string.md) - String manipulation with `String` struct
- [Collections](30-stdlib-collections.md) - `Array<T>`, `Map<K,V>`, and `Set<T>`
- [File System](31-stdlib-fs.md) - File operations
- [Math and Random](32-stdlib-math.md) - Mathematical functions
- [Time and Date](33-stdlib-time.md) - Temporal operations
- [Algorithms](34-stdlib-algorithms.md) - Sorting, searching, and more

### Advanced Topics

- [Inline Assembly](35-inline-assembly.md) - Low-level programming with `asm`
- [FFI (Foreign Function Interface)](36-ffi.md) - Calling C functions with `extern`
- [LLVM Intrinsics](58-intrinsics.md) - Built-in functions for performance
- [Cross-Compilation](37-cross-compilation.md) - Building for different platforms
- [Code Formatting](38-code-formatting.md) - Consistent code style with `bpl format`
- [Compiler Options](39-compiler-options.md) - Flags and configuration

### Best Practices

- [Coding Conventions](40-coding-conventions.md) - Style guide
- [Performance Tips](41-performance.md) - Writing efficient code
- [Common Pitfalls](42-common-pitfalls.md) - Avoiding mistakes
- [Design Patterns](43-design-patterns.md) - Reusable solutions

### Reference

- [Language Specification](44-language-spec.md) - Formal language definition
- [Grammar Reference](45-grammar-reference.md) - Complete grammar
- [Keyword Index](46-keyword-index.md) - All reserved words
- [Operator Precedence](47-operator-precedence.md) - Expression evaluation order
- [Standard Library API](48-stdlib-api.md) - Complete API reference

### Tools and Ecosystem

- [VS Code Extension](49-vscode-extension.md) - Editor integration
- [Build Systems](50-build-systems.md) - Integration with make, cmake, etc.
- [Debugging](51-debugging.md) - Troubleshooting techniques
- [Extending the Compiler](57-extending-compiler.md) - Adding primitives and features
- [Native Runtime Plan](52-native-runtime-plan.md) - Future runtime architecture

## Examples

Every documentation page includes practical examples. For a complete collection of working programs, see the [examples directory](../examples/).

## Contributing

Found an error or want to improve the documentation? Open a pull request with the docs change and the relevant verification output.

## License

This documentation is licensed under Apache-2.0, same as the BPL compiler.
