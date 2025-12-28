---
applyTo: "**/*.bpl, **/*.x, **/*.sh"
---

# BPL (Basic Programming Language) Coding Assistant Instructions

You are working with BPL, a statically-typed, compiled programming language that transpiles to LLVM IR. Follow these instructions strictly when writing code, creating examples, or running tests.

## 1. Syntax & Language Rules

### Comments

- **Single-line comments**: Start with `#` and continue to the end of the line.
- **Multi-line comments**: Enclosed in `### ... ###`.

```bpl
# This is a single-line comment

###
This is a
multi-line comment
###
```

### Data Types

#### Primitive Types

- `int` - signed 32-bit integers
- `uint` - unsigned 32-bit integers
- `u8`, `u16`, `u32`, `u64` - unsigned integer variants
- `float` - 64-bit floating point numbers
- `bool` - boolean type (`true`, `false`)
- `char` - unsigned 8-bit character
- `void` - empty/no return type
- `nullptr` - null values

#### Composite Types

- **Pointers**: `*T` (e.g., `*int`, `**int`)
- **Arrays**: `T[]` (dynamic) or `T[N]` (fixed size, e.g., `int[5]`)
- **Tuples**: `(T1, T2, ...)` (e.g., `(int, bool)`, `(int, float, string)`)
- **Function Types**: `Func<ReturnType>(ArgType1, ArgType2, ...)`
- **Generics**: `Box<T>`, `List<T>`, `Map<K, V>`
- **Enums**: `enum Option<T> { Some(T), None }`
- **String**: `string` (equivalent to `*char`)

#### Type Aliases

Create named aliases for complex types:

```bpl
type ID = int;
type Point2D = (int, int);
type Callback = Func<void>(int);
type IntArray = int[];
type SortFunc<T> = Func<int>(T, T);
```

### Variables

#### Local Variables

- Declare with `local` keyword.
- Must have explicit type annotations.
- Can be initialized or uninitialized.

```bpl
local x: int;
local y: int = 42;
local name: string = "BPL";
local (a: int, b: float) = getTuple();
```

#### Global Variables

- Declare with `global` keyword.
- Must be initialized at declaration.
- Accessible from all functions.

```bpl
global MAX_SIZE: int = 1000;
global PI: float = 3.14159;
```

#### Destructuring

Unpack tuples into individual variables:

```bpl
local (x: int, y: int) = getTuple();
local ((a: int, b: int), c: float) = getNestedTuple();  # Nested tuples
(x, y) = (y, x);  # Swap already-declared variables
```

### Functions

#### Declaration and Invocation

- Declare functions using `frame` keyword.
- Specify return type with `ret`.
- Use explicit `return` statement.
- Invoke directly by name (no dot notation for free functions).

```bpl
frame add(a: int, b: int) ret int {
    local result: int = a + b;
    return result;
}

frame main() ret int {
    local sum: int = add(10, 20);
    return 0;
}
```

#### Generic Functions

- Use angle brackets `<T>` for type parameters.
- Type parameters must be used in function signature.

```bpl
frame identity<T>(val: T) ret T {
    local temp: T = val;
    return temp;
}

frame swap<T>(a: T, b: T) ret (T, T) {
    return (b, a);
}

frame main() ret int {
    local x: int = identity<int>(42);
    local (y, z): (int, int) = swap<int>(10, 20);
    return 0;
}
```

#### Function Pointers

Store function references for dynamic invocation:

```bpl
type MathOp = Func<int>(int, int);

frame apply(op: MathOp, a: int, b: int) ret int {
    return op(a, b);
}

frame multiply(x: int, y: int) ret int {
    return x * y;
}

frame main() ret int {
    local mul: MathOp = multiply;
    local result: int = apply(mul, 5, 3);  # result = 15
    return 0;
}
```

#### Void Functions

Functions without return values:

```bpl
frame printNumber(n: int) {
    # No return statement needed
    printf("Number: %d\n", n);
}
```

### Structs and Methods

#### Basic Structs

- Declare with `struct` keyword.
- Fields are public by default (no visibility modifiers yet).
- Support constructor-like methods.

```bpl
struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }

    frame distance(this: Point) ret float {
        return sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}

frame main() ret int {
    local p: Point = Point.new(3, 4);
    printf("Distance: %.2f\n", p.distance());
    return 0;
}
```

#### Generic Structs

- Type parameters apply to the entire struct.
- Generic methods can have additional type parameters.

```bpl
struct Box<T> {
    value: T,

    frame new(val: T) ret Box<T> {
        local b: Box<T>;
        b.value = val;
        return b;
    }

    frame get(this: Box<T>) ret T {
        return this.value;
    }

    frame map<U>(this: Box<T>, transform: Func<U>(T)) ret Box<U> {
        local result: Box<U>;
        result.value = transform(this.value);
        return result;
    }
}

frame main() ret int {
    local int_box: Box<int> = Box<int>.new(42);
    local val: int = int_box.get();
    return 0;
}
```

#### Struct Inheritance

- Use `extends` for single inheritance.
- Child structs inherit parent fields and methods.

```bpl
struct Animal {
    name: string,

    frame makeSound(this: Animal) {
        printf("%s makes a sound\n", this.name);
    }
}

struct Dog extends Animal {
    breed: string,

    frame makeSound(this: Dog) {
        printf("%s barks!\n", this.name);
    }
}
```

### Enums

#### Basic Enums

- Declare with `enum` keyword.
- Variants can hold data (Algebraic Data Types).
- Can have methods just like structs.

```bpl
enum Status {
    Pending,
    Active,
    Completed,
    Failed(int),  # Variant with data (error code)
}

frame main() ret int {
    local s: Status = Status.Failed(404);
    return 0;
}
```

#### Generic Enums

- Enums can be generic.
- Useful for types like `Option<T>` or `Result<T, E>`.

```bpl
enum Option<T> {
    Some(T),
    None,

    # Enums can have methods too
    frame isSome(this: Option<T>) ret bool {
        return match<Option.Some>(this);
    }
}
```

### Control Flow

#### Conditionals

- Conditions must be enclosed in parentheses.
- Supports `if`, `else if`, `else`.

```bpl
if (x > 0) {
    printf("Positive\n");
} else if (x < 0) {
    printf("Negative\n");
} else {
    printf("Zero\n");
}
```

#### Loops

- Use `loop` for iteration (acts as `while` when condition provided).
- `loop { ... break; }` for infinite loops.
- Use `break` to exit loops, `continue` to skip iterations.

```bpl
# Conditional loop
loop (i < 10) {
    i = i + 1;
}

# Infinite loop with break
local count: int = 0;
loop {
    if (count >= 5) {
        break;
    }
    count = count + 1;
}

# Loop with continue
local i: int = 0;
loop (i < 10) {
    i = i + 1;
    if (i % 2 == 0) {
        continue;
    }
    printf("%d\n", i);
}
```

#### Switch Statements

- Supports multiple cases and default.
- Expression must be enclosed in parentheses.

```bpl
switch (value) {
    case 1: {
        printf("One\n");
    }
    case 2: {
        printf("Two\n");
    }
    default: {
        printf("Other\n");
    }
}
```

#### Pattern Matching

- Use `match` expression for pattern matching on enums.
- Supports destructuring of variant data.
- Must be exhaustive (cover all cases).

```bpl
local opt: Option<int> = Option<int>.Some(42);

local val: int = match (opt) {
    Option<int>.Some(x) => x,
    Option<int>.None => 0,
};
```

#### Type Checking Operator

- Use `match<Type>(value)` to check if a value matches a specific type or enum variant.
- Returns `bool`.

```bpl
if (match<Option.Some>(opt)) {
    printf("It is Some!\n");
}
```

#### Ternary Operator

```bpl
local max: int = (a > b) ? a : b;
local message: string = (x > 0) ? "positive" : "non-positive";
```

### Exception Handling

- Use `try`/`catch` for error handling.
- Support multiple `catch` blocks for different types.
- `throw` can throw any type of value.

```bpl
extern printf(fmt: string, ...);

struct DivisionError {
    code: int,
    message: string,
}

frame divide(a: int, b: int) ret int {
    if (b == 0) {
        throw 1;  # Throw error code
    }
    return a / b;
}

frame main() ret int {
    try {
        local result: int = divide(10, 0);
    } catch (e: int) {
        printf("Caught error code: %d\n", e);
    } catch (e: DivisionError) {
        printf("Caught struct error: %s\n", e.message);
    } catchOther {
        printf("Caught unknown error\n");
    }
    return 0;
}
```

### Operators

#### Arithmetic

- `+` (addition), `-` (subtraction), `*` (multiplication), `/` (division), `%` (modulo)
- Prefix increment/decrement: `++i`, `--i` (postfix `i++`, `i--` NOT supported)

#### Logical

- `&&` (AND), `||` (OR), `!` (NOT)

#### Bitwise

- `&` (AND), `|` (OR), `^` (XOR), `~` (NOT), `<<` (left shift), `>>` (right shift)

#### Comparison

- `==`, `!=`, `<`, `<=`, `>`, `>=`

#### Assignment

- `=` (simple), `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`

#### Special Operators

- **Cast**: `cast<int>(3.5)` - type conversion
- **Sizeof**: `sizeof(int)` or `sizeof(variable)` - memory size in bytes
- **Address**: `&variable` - get pointer to variable
- **Dereference**: `*pointer` - access pointed value
- **Array indexing**: `arr[index]`
- **Pointer arithmetic**: `ptr + n`, `ptr - n`
- **Member access**: `struct.field`, `struct.method()`

```bpl
local x: int = 10;
local y: float = cast<float>(x);
local size: int = sizeof(int);
local ptr: *int = &x;
local deref: int = *ptr;
local arr: int[5];
local first: int = arr[0];
```

### Imports and Exports

#### Importing Symbols

- Types must be enclosed in brackets `[]`.
- Functions and values imported without brackets.
- Can use wildcard with namespace: `import * as std from "std";`

```bpl
# Import functions
import printf from "libc";
import add, subtract from "./math.bpl";

# Import types
import [Point], [Vector] from "./geometry.bpl";

# Mixed imports
import process, [Config] from "./lib.bpl";

# Namespace import
import * as std from "std";
```

#### Exporting Symbols

- Symbols are private by default.
- Use `export` keyword to make symbols public.
- Export types the same way as imports (types in brackets).

```bpl
export [MyStruct];
export myFunction;
export globalValue;
```

#### Module Resolution

- Default extension is `.bpl` (legacy `.x` still resolves).
- Local imports use `"./"` prefix: `import X from "./file.bpl";`
- Standard library imports use module names: `import X from "std";`
- FFI imports from libc: `import printf from "libc";`

### Standard Library

The unified standard library provides:

```bpl
import [IO], [Array], [String], [Map], [Math] from "std";

# IO operations
IO.print("message");
IO.printInt(42);
IO.printString("hello");

# Array operations
local arr: Array<int> = Array<int>.new(10);
arr.push(5);
arr.set(0, 100);
local len: int = arr.len();

# String operations
local s: String = String.new("hello");
local cstr: *char = s.toString();
s.destroy();

# Map operations
local m: Map<int, string> = Map<int, string>.new(10);
m.set(1, "one");
if (m.has(1)) {
    local val: string = m.get(1).unwrap();
}

# Math operations
local min_val: int = Math.minInt(5, 10);
local max_val: int = Math.maxInt(5, 10);
```

### Foreign Function Interface (FFI)

Declare external C functions with `extern`:

```bpl
extern printf(fmt: string, ...);
extern strlen(str: *char) ret int;
extern malloc(size: int) ret *void;
extern free(ptr: *void);
extern rand() ret int;
```

### Inline Assembly

For performance-critical sections, you can embed LLVM IR or assembly instructions:

```bpl
asm {
    "mov rax, 1"
}
```

## 2. Memory Management

### Manual Memory Management

BPL provides explicit control over memory allocation and deallocation:

```bpl
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    # Allocate memory
    local size: int = sizeof(int) * 10;
    local ptr: *int = cast<*int>(malloc(size));

    # Use memory
    *ptr = 42;
    *(ptr + 1) = 100;

    # Free memory
    free(cast<*void>(ptr));

    return 0;
}
```

### Stack vs Heap

- **Stack**: Variables declared with `local` or `global` are on stack (preferred for most cases).
- **Heap**: Use `malloc` for dynamic allocation.
- **Pointers**: Manage lifetime carefully; no garbage collection.

### Lifetime and Scope

- Local variables live until function exit.
- Global variables persist for program lifetime.
- Pointers to stack variables become invalid after function returns.

```bpl
frame badExample() ret *int {
    local x: int = 10;
    return &x;  # DANGER: returning pointer to stack variable
}

frame goodExample() ret *int {
    local ptr: *int = cast<*int>(malloc(sizeof(int)));
    *ptr = 10;
    return ptr;  # Safe: heap allocation persists
}
```

## 3. Common Patterns

### Option/Maybe Pattern

Use the `enum` feature to implement Option types:

```bpl
enum Option<T> {
    Some(T),
    None,
}

frame process(opt: Option<int>) {
    match (opt) {
        Option<int>.Some(val) => {
            printf("Value: %d\n", val);
        },
        Option<int>.None => {
            printf("No value\n");
        }
    }
}
```

### Builder Pattern

Construct complex objects step by step:

```bpl
struct ConfigBuilder {
    timeout: int,
    retries: int,

    frame new() ret ConfigBuilder {
        local b: ConfigBuilder;
        b.timeout = 30;
        b.retries = 3;
        return b;
    }

    frame withTimeout(this: ConfigBuilder, t: int) ret ConfigBuilder {
        this.timeout = t;
        return this;
    }
}
```

## 4. Project Structure & Examples

### Directory Organization

```
examples/
  <example_name>/
    main.bpl              # Main source file
    test_config.json      # Test configuration
    *.bpl                 # Supporting files (optional)
    test.sh               # Custom test script (optional)
```

- **Location**: All new examples MUST be placed in `examples/<example_name>/`.
- **File Naming**: The main file should be `main.bpl` inside that directory.
- **Supporting Files**: Additional `.bpl` files are allowed and encouraged for modular code.

### Example Structure

Minimal example:

```bpl
# examples/my_example/main.bpl
extern printf(fmt: string, ...);

frame main() ret int {
    printf("Hello from my example!\n");
    return 0;
}
```

With test configuration:

```json
{
  "expectedOutput": ["Hello from my example!"],
  "args": [],
  "env": {},
  "input": "",
  "skip_compilation": false
}
```

## 5. Testing & Verification (MANDATORY)

**You must verify your code before completing the task.**

### Integration Test System

- **Driver**: `tests/Integration.test.ts` runs `examples/<name>/main.bpl` via `cmp.sh`.
- **Configuration**: `test_config.json` specifies:
  - `expectedOutput`: string[] - expected stdout
  - `args`: string[] - command-line arguments
  - `env`: Record<string, string> - environment variables
  - `input`: string - stdin input
  - `skip_compilation`: boolean - skip compilation step if true

### Two Paths for Testing

**Path 1: Simple Test (Recommended)**

- Single `main.bpl` + `test_config.json`
- Used by Integration test runner
- Fastest, simplest approach

**Path 2: Complex Test**

- Custom `test.sh` script in example directory
- For multi-file orchestration or complex scenarios
- Must exit with code 0 on success, non-zero on failure
- Wire into `./tests.sh` or CI runner

### Running Tests

```bash
# Run all tests (unit + integration)
bun test

# Run integration tests only
bun test tests/Integration.test.ts

# Run custom example test script
examples/<name>/test.sh

# Compile and run a file directly
bun index.ts examples/path/to/file.bpl --run

# Emit LLVM IR (for debugging)
bun index.ts examples/path/to/file.bpl --emit llvm
```

### Test Workflow

**For simple examples:**

1. Write `main.bpl` in `examples/<name>/`.
2. Create `test_config.json` with expected output.
3. Run `bun test tests/Integration.test.ts` to verify.

**For complex examples:**

1. Write `main.bpl` and supporting `.bpl` files.
2. Create `test.sh` script to orchestrate testing.
3. Add `test_config.json` with `"skip_compilation": true` if needed.
4. Run `examples/<name>/test.sh` or `bun test` to verify.

### Test Configuration Examples

**Basic output test:**

```json
{
  "expectedOutput": ["Result: 42"],
  "args": [],
  "env": {},
  "input": ""
}
```

**With command-line arguments:**

```json
{
  "expectedOutput": ["Sum: 15"],
  "args": ["10", "5"],
  "env": {},
  "input": ""
}
```

**With stdin input:**

```json
{
  "expectedOutput": ["You entered: hello"],
  "args": [],
  "env": {},
  "input": "hello\n"
}
```

**With environment variables:**

```json
{
  "expectedOutput": ["Debug mode: on"],
  "args": [],
  "env": { "DEBUG": "1" }
}
```

## 6. Best Practices

### Code Organization

1. **One concept per file**: Keep files focused on a single responsibility.
2. **Use modules**: Separate concerns with imports/exports.
3. **Meaningful names**: Use clear, descriptive function and variable names.
4. **Comments**: Document complex logic with `#` comments.

```bpl
# math.bpl - Mathematical operations
export frame add(a: int, b: int) ret int;
export frame multiply(a: int, b: int) ret int;

frame add(a: int, b: int) ret int {
    return a + b;
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}
```

### Error Handling

1. **Use try/catch** for operations that can fail.
2. **Throw early** to signal errors immediately.
3. **Provide context** in error messages when possible.

```bpl
frame parseNumber(str: *char) ret int {
    # Assuming parse implementation
    if (str == nullptr) {
        throw 1;  # Error code for null input
    }
    # ... parsing logic
    return 0;
}
```

### Memory Safety

1. **Initialize pointers** before use.
2. **Check for nullptr** before dereferencing.
3. **Free allocated memory** (no automatic cleanup).
4. **Avoid buffer overflows** with bounds checking.

```bpl
frame safeAccess(arr: *int, size: int, index: int) ret int {
    if (index < 0 || index >= size) {
        throw 2;  # Error: index out of bounds
    }
    return *(arr + index);
}
```

### Type Safety

1. **Use type aliases** for clarity.
2. **Leverage generics** for reusable code.
3. **Explicit casts** when type conversion needed.

```bpl
type Age = int;
type UserID = int;

frame getUserAge(id: UserID) ret Age {
    # Implementation
    return 0;
}
```

### Performance Considerations

1. **Stack allocation** over heap when possible.
2. **Pass by pointer** for large structs.
3. **Inline functions** for simple operations.
4. **Avoid unnecessary copies** with pointers.

```bpl
# Prefer this for large structs:
frame process(data: *LargeStruct) ret int {
    return data.value;
}

# Over this:
frame processCopy(data: LargeStruct) ret int {
    return data.value;
}
```

## 7. Common Pitfalls

### Do NOT Use

- **Postfix increment/decrement**: `i++`, `i--` → use `++i`, `--i` or `i += 1` instead
- **For loops**: No C-style `for(;;)` → use `loop` with conditions
- **Do-while loops**: Not supported → use `loop { ... if (cond) break; }`
- **Class keyword**: Use `struct` instead
- **Access modifiers**: No `public`/`private` yet (all public)
- **Variable shadowing**: Avoid reusing names in nested scopes

### Correct Patterns

```bpl
# YES: Prefix increment
local i: int = 0;
++i;

# NO: Postfix increment
# i++;  # Not allowed

# YES: Loop with condition
loop (i < 10) {
    i = i + 1;
}

# NO: For loop
# for (local i = 0; i < 10; i++)  # Not allowed

# YES: Enums for state
enum Status { Pending, Active }
```

## 8. Bug Reporting

If you encounter any bugs, crashes, or unintended behavior in the compiler while generating examples or writing code:

1. **Verify**: Ensure it is a compiler issue and not a mistake in your BPL code.
2. **Check**: Look at `BUGS.md` to see if it is already known.
3. **Report**: If it is a new bug, add it to `BUGS.md` with a description and a minimal reproduction case.
4. **Proceed**: If possible, find a clean workaround. If not, document the limitation in your code comments.
