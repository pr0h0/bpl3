# BPL3 Language Specification

This document outlines the syntax, types, and constructs available in the BPL3 language.

## 1. Syntax Basics

### Comments

- **Single-line comments**: Start with `#` and continue to the end of the line.
- **Multi-line comments**: Enclosed in `/# ... #/`.

```bpl
# This is a single-line comment

/#
This is a
multi-line comment
#/
```

### Literals

- **String**: `"Hello"`
- **Interpolated String**: `` `Value: ${x}` ``
- **Char**: `'c'`
- **Boolean**: `true`, `false`
- **Null**: `null`, `nullptr`
- **Numbers**: `123`, `0xFF`, `3.14`

## 2. Semantic Core

This section defines the semantic contract the compiler currently implements. Syntax documentation can be loose; this section is the behavior tests and codegen must preserve.

### Primitive Type Commitments

- `int` and `uint` are 32-bit integer aliases for `i32` and `u32`.
- `long` and `ulong` are 64-bit integer aliases for `i64` and `u64`.
- `short` and `ushort` are 16-bit integer aliases for `i16` and `u16`.
- `char` and `uchar` are 8-bit integer aliases for `i8` and `u8`.
- `bool` is a 1-bit boolean value.
- `float` and `double` lower to 64-bit LLVM `double` values in the current backend.
- `void` has no runtime value unless used behind a pointer, where `*void` lowers as `i8*`.
- `null` is compatible with struct/object values and pointer-like null contexts; `nullptr` is compatible with pointer types.
- `string` currently lowers as a C-compatible `i8*` string pointer.

### Array, Pointer, and Slice Semantics

- `T[N]` is a fixed-size value array with exactly `N` contiguous elements.
- `T[]` is a non-owning slice. It does not allocate, free, or own the pointed-to storage.
- `*T` is a raw pointer. It carries no length and has no ownership semantics.
- `Array<T>` is the standard library growable collection. It is the owning dynamic array abstraction.
- Fixed arrays may be indexed with runtime bounds checks when the compiler knows the fixed length.
- Slices may be indexed with runtime bounds checks using the stored length.
- Raw pointers may be indexed with direct pointer arithmetic. The compiler cannot bounds-check raw pointers.
- Assigning or passing a fixed array where a slice is expected creates a view of the existing array storage.
- Initializing a slice from an array literal materializes backing storage for the literal and creates a slice view over it.

### Conversion Semantics

Implicit conversions are intentionally narrow:

- Integer types with compatible scalar integer shapes may be implicitly converted.
- Fixed arrays may decay to a raw pointer when the destination type is the matching `*T`.
- Fixed arrays may convert to slices when the destination type is the matching `T[]`.
- Slice-to-pointer conversion is not implicit. Use explicit pointer extraction APIs when they exist.
- Slice-to-fixed-array conversion is not implicit.
- Struct inheritance conversions allow child values where parent values are expected; value conversion is struct slicing.
- `*void` is compatible with other pointer types for FFI-oriented use.
- Lambda values are not implicitly assignable to `Func` values. A non-capturing lambda may be checked as a function where the type checker has proven it is stateless.

## 3. ABI Lowering Contract

The LLVM lowering is part of the language contract for v0.1 features that interoperate with C, inline assembly, or generated IR tests.

### Function and Lambda ABI

- `Func<R>(...)` lowers to a thin function pointer; concretely, `Func<R>(Args...)` lowers to a raw pointer with signature `R (Args...)*`.
- `Lambda<R>(...)` lowers to a closure value; concretely, `Lambda<R>(Args...)` lowers to `{ R (i8*, Args...)*, i8* }`.
- The first lambda field is the thunk/function pointer. The second field is the erased capture context pointer.
- Passing a `Func` to C ABI code passes only the raw function pointer.
- Passing a `Lambda` passes the closure value and is not C ABI compatible by default.

### Slice ABI

- `T[]` lowers to `{ T*, i64 }`.
- Field 0 is the data pointer.
- Field 1 is the element count.
- `T[N]` to `T[]` lowering emits a `getelementptr` to the first element and inserts the compile-time length.
- The fixed-array to slice path must not copy the source array.

## 4. Compiler Pipeline Contract

The compiler currently runs as parser AST, type checker, and LLVM code generator. Incremental lowering rules live in the middle end so semantic conversions can be named once and consumed by both type checking and codegen.

- The parser records syntax and source locations. It does not decide ABI behavior.
- The type checker resolves names, overloads, generic instantiations, and whether conversions are allowed.
- The incremental lowering layer classifies implicit conversions such as identity, array-to-pointer decay, and array-to-slice view construction.
- Codegen consumes resolved types and explicit lowering decisions. It should not invent new semantic conversions by string-matching LLVM types.
- Golden LLVM shape tests are part of the contract for ABI-sensitive features.

## 5. Declarations

### Variables

Variables must be declared as `local` or `global`.

```bpl
local x: int;
local y: int = 10;
global MAX: int = 100;
local (a:int, b:uint) = tuple
```

### Type Aliases

Create new names for existing types.

```bpl
type ID = int;
type Point2D = (int, int);
type Callback = Func<void>(int);
type SortFunc<T> = Func<int>(T, T);
type IntArr = int[];
```

### Destructuring

Tuple destructuring is supported.

```bpl
local (a: int, b: bool) = getTuple();
(a,b)=tuple # a and b must be already declared at this point
(a,b) = (b,a)
```

### Constants

Use the `const` keyword to declare immutable variables.

```bpl
local const PI: float = 3.14159;
global const MAX_USERS: int = 100;
```

`const` can also be used for function parameters:

```bpl
frame process(data: const *int) { ... }
```

### Scoping

Variables are lexically scoped. A variable declared inside a block `{ ... }` is only visible within that block and its sub-blocks. Inner blocks can shadow variables from outer blocks.

```bpl
local x: int = 10;
if (true) {
    local x: int = 20; # Shadows outer x
    printf("%d", x); # Prints 20
}
printf("%d", x); # Prints 10
```

## 6. Functions

### Declaration

Functions can be `frame` (stack frame based).

```bpl
frame main() ret int {
    return 0;
}

struct X {
    frame sum(this:*X){ # member method
        return 5;
    }
    frame add(a: int, b: int) ret int { # static method
        return a + b;
    }
}

frame print(a:*char) {...}
```

### Generics

```bpl
frame identity<T>(val: T) ret T {
    local temp: T = val;
    return temp;
}
```

## 7. Structs

Structs can contain fields and methods. Structs can inherit from a single parent struct using the `:` operator. All structs implicitly inherit from the root `Type` struct.

```bpl
struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point { ... }
}

struct Point3D : Point {
    z: int
}

struct Generic<T>{
    val: T,
    frame add<X>(a:T,b:X) ret (T,X){
        return (a,b);
    }
    frame print<X>(obj:T, xx:X){
        printn(xx);
        print(obj.val);
        print(xx);
    }
}
```

## 7.1 Specs - Interfaces

Specs define interfaces that structs can implement.

```bpl
spec Drawable {
    frame draw(this:Self);
}

struct Shape {}

struct Circle: Shape, Drawable, <other specs> {
    radius: float,

    frame draw(this: Circle) {
        # Implementation of draw for Circle
    }
}
```

Structs can inherit only one struct but can implement multiple specs.

## 8. Control Flow

### Conditionals

Conditions must be enclosed in parentheses.

```bpl
if (x > 0) {
    # ...
} else if (x < 0) {
    # ...
} else {
    # ...
}
```

### Loops

The `loop` construct supports three forms: infinite, while-style, and C-style for loops.

```bpl
# Infinite loop
loop {
    if (condition) break;
}

# While-style loop
loop (i < 10) {
    i = i + 1;
}

# C-style for loop
loop (local i: int = 0; i < 10; i = i + 1) {
    printf("%d", i);
}

# C-style loop with missing parts
loop (; i < 10; ) { ... }
loop (;;) { ... } # Equivalent to loop { ... }
```

### Defer

The `defer` statement schedules a block of code to be executed when the current scope exits. This is useful for resource cleanup, such as closing files or freeing memory.

- **LIFO Order**: Deferred statements are executed in Last-In, First-Out order (reverse of declaration).
- **Scope Bound**: Execution happens when the enclosing block exits (via return, break, continue, throw, or fallthrough).
- **Void Return**: The deferred block must return `void`. It cannot return a value to the outer function.

```bpl
frame processFile(path: string) {
    local file: File = open(path);
    defer {
        close(file);
    }

    # ... process file ...
    # close(file) is called automatically here
}
```

### Switch

The switch expression must be enclosed in parentheses.

```bpl
switch (val) {
    case 1: { ... }
    default: { ... }
}
```

### Error Handling

```bpl
try {
    throw 1;
} catch(e: int) {
    # Handle error
} catch(e:bool){
    # Handle bool error
} catch {
    # Handle unknown
}
```

## 9. Expressions & Operators

### Operators

- **Arithmetic**: `+`, `-`, `*`, `/`, `%`
- **Logical**: `&&`, `||`, `!`
- **Bitwise**: `&`, `|`, `^`, `~`, `<<`, `>>`
- **Comparison**: `==`, `!=`, `<`, `<=`, `>`, `>=`
- **Assignment**: `=`, `+=`, `-=`, etc.
- **Ternary**: `cond ? trueVal : falseVal`

### Special Expressions

- **Cast**: `cast<int>(3.5)` or `(3.5 as int)`
- **Type Check**: `(val is int)`
- **Sizeof**: `sizeof(int)` or `sizeof(var)`
- **Match**: `match(val) { ... }` (Pattern matching) or `match<Type>(val)` (Type check)
- **Address/Dereference**: `&var`, `*ptr`
- **Lambda**: `|arg(s):type| ret Type { ... }` - may contain 0 or many args:type, return type may be omitted if void

### Pattern Matching

The `match` expression supports comprehensive pattern matching:

```bpl
# Primitive patterns (int, float, bool, string, char)
match (x) {
    0 => "zero",
    42 => "answer",
    n if n < 0 => "negative",
    _ => "other",
}

# Tuple patterns
match (point) {
    (0, 0) => "origin",
    (0, y) => "y-axis",
    (x, 0) => "x-axis",
    (x, y) if x == y => "diagonal",
    (x, y) => "other",
}

# Enum patterns
enum Option<T> { Some(T), None }
match (opt) {
    Option.Some(val) => val,
    Option.None => 0,
}
```

**Pattern Types:**

- **Literals**: `0`, `3.14`, `true`, `"hello"`, `'A'`
- **Identifiers**: `x`, `n` (binds the matched value)
- **Tuples**: `(a, b)`, `(0, y)`, `(x, y, z)`
- **Wildcards**: `_` (matches anything, doesn't bind)
- **Enums**: `Type.Variant(binding)`
- **Guards**: `pattern if condition` (adds conditional logic)

## 10. Known Limitations / Disallowed Constructs

The following are **NOT** currently supported by the grammar:

- **For Loops**: No C-style `for(;;)` or `foreach`. Use `loop`.
- **Postfix Increment/Decrement**: `i++` and `i--` are not supported. Use `++i` or `i += 1`.
- **Type Aliases**: Aliases are defined via `type Name = ...`, check Type Aliases Section above.
- **Visibility**: No `public` / `private` modifiers (all members are public).
- **Do-While**: No `do { ... } while` loop.

## 11. Modules and Imports

BPL3 supports a module system with explicit imports and exports.

### Imports

Imports must specify the symbols to import and the source file. Types must be enclosed in brackets `[]`.

```bpl
# Import functions and values
import myFunc, myGlobal from "./utils.bpl";

# Import types (must be in brackets)
import [MyStruct], [MyType] from "./types.bpl";

# Mixed imports
import process, [Config], [DisposableSpec], { MAX_USERS } from "./lib.bpl";

# Namespace import
import * as std from "std";
```

### Exports

Symbols are private to the module by default. Use `export` to make them available to other modules.

```bpl
export myFunc;
export [MyStruct];
export { variable }
```

## 12. Inline Assembly

BPL supports inline assembly blocks for embedding LLVM IR or platform-specific assembly.

### Syntax

```bpl
# Raw LLVM IR (default or "llvm")
asm("llvm") {
    "%ptr = getelementptr i32, i32* (var), i32 0"
    "store i32 1, i32* %ptr"
}

# Intel Syntax
asm("intel") {
    mov eax, (input)          # Input
    add eax, 1
    mov (=output), eax        # Output
    [ "eax" ]                 # Clobbers
}

# AT&T Syntax
asm("att") {
    movl (input), %eax
    addl $1, %eax
    movl %eax, (=output)
}
```

### Flavors

- **`llvm`** (or `raw`): Injects content directly into LLVM IR. Supports `(var)` interpolation (resolves to pointer).
- **`intel`** (or `x86`): Wraps content in `call void asm sideeffect inteldialect`. Supports full interpolation.
- **`att`**: Wraps content in `call void asm sideeffect`. Supports full interpolation.

### Interpolation & Constraints

- **Input**: `(var)` or `(var: "constraint")`. Default constraint is `"r"`.
- **Output**: `(=var)` or `(=var: "constraint")`. Default constraint is `"=r"`.
- **Address**: `(&var)`. Passes the address of the variable.
- **Clobbers**: `[ "reg1", "reg2", "memory" ]`.

### Constraints

Standard LLVM inline assembly constraints apply:

- `"r"`: General purpose register
- `"m"`: Memory operand
- `"i"`: Immediate integer
- `"={eax}"`: Specific register output
- `"{eax}"`: Specific register input

```bpl
asm("intel") {
    mov eax, (val: "{ebx}")   # Force val into ebx
    mov (=res: "={ecx}"), eax # Force result from ecx
}
```

asm("x86") {
"mov eax, 1"
"add eax, 2"
}

# AT&T Syntax

asm("att") {
"movl $1, %eax"
}

### Variable Interpolation

Variables can be interpolated into assembly blocks using parentheses.

- **Raw LLVM (`asm`)**: `(var)` resolves to the pointer/register name.
- **Intel (`asm("x86")`)**:
  - `(var)`: Value of the variable.
  - `(&var)`: Address of the variable.
- **AT&T (`asm("att")`)**:
  - `(var)`: Value of the variable.
  - `(&var)`: Address of the variable.
  - `((&var))`: Dereference address (memory access).

```bpl
local val: int = 10;
asm("x86") {
    "mov eax, (val)"
}
asm("att") {
    "movl (val), %eax"
}
```

## 13. Standard Library Overview

The BPL standard library (`std`) provides core functionality.

- **std/io.bpl**: Input/Output (printf replacement soon).
- **std/process.bpl**: Process execution and management.
- **std/string.bpl**: String manipulation.
- **std/collections**: Lists, Maps, Sets.
