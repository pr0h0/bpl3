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

## 1. Types

### Primitive Types

_Note: The grammar uses `Identifier` for types, implying these are defined in the standard library or built-in._

- `int` - signed integers 64 bit
- `uint` - unsigned integers 64 bit
- `float` - floats 64 bit
- `bool` (Boolean: `true`, `false`) - u1 if exists 0/1
- `char` (Character literals: `'c'`) - unsigned 8 bit
- `void` (Empty type)
- `null` (Null type)
- `nullptr` - null but compatible with pointers

### Composite Types

- **Pointers**: `*T` (e.g., `*int`, `**int`)
- **Arrays**: `T[]` or `T[N]` (e.g., `int[]`, `float[4]`)
- **Tuples**: `(T1, T2, ...)` (e.g., `(int, bool)`)
- **Functions**: `Func<ReturnType>(ArgType1, ArgType2, ...)` (e.g., `Func<void>(int, int)`)
- **Generics**: `List<T>`, `Map<K, V>`
- **Enums**: `enum Name { Variant1, Variant2(Type) }`

## 2. Declarations

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

## 3. Functions

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

## 4. Structs

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

## 4.1 Specs - Interfaces

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

## 5. Control Flow

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
    local file = open(path);
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

## 6. Expressions & Operators

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

## 7. Known Limitations / Disallowed Constructs

The following are **NOT** currently supported by the grammar:

- **For Loops**: No C-style `for(;;)` or `foreach`. Use `loop`.
- **Postfix Increment/Decrement**: `i++` and `i--` are not supported. Use `++i` or `i += 1`.
- **Type Aliases**: Aliases are defined via `type Name = ...`, check Type Aliases Section above.
- **Visibility**: No `public` / `private` modifiers (all members are public).
- **Do-While**: No `do { ... } while` loop.

## 8. Modules and Imports

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

## 9. Inline Assembly

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

## 10. Standard Library Overview

The BPL standard library (`std`) provides core functionality.

- **std/io.bpl**: Input/Output (printf replacement soon).
- **std/process.bpl**: Process execution and management.
- **std/string.bpl**: String manipulation.
- **std/collections**: Lists, Maps, Sets.
