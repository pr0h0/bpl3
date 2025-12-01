# BPL 3

## The Best Programming Language v3

BPL is a simple programming language that compiles to x86-64 assembly. It is designed to be easy to learn and use, while still being powerful enough to write complex programs.

## Installation

To install BPL, you need to have `bun`, `nasm` and `gcc` installed on your system.

- Clone the repository
- Install the dependencies
- Check if everything is working

```bash
git clone https://github.com/pr0h0/bpl3.git
cd bpl3
bun install
bun index.ts example/hello-world.x
./example/hello-world
```

You should see "Hello, World!" printed to the console.
More examples can be found in the `example` directory.

## VS Code Extension

BPL includes a full-featured VS Code extension providing syntax highlighting, code completion, go-to-definition, and hover information.

To install it:

1. Navigate to `vs-code-ext`.
2. Run the build script: `./build_extension.sh`.
3. Install the generated `.vsix` file located in `vs-code-ext/client/` (e.g., `code --install-extension vs-code-ext/client/bpl-vscode-0.1.0.vsix`).

## Language Features

- **Variables and Data Types**: Supports integers (`u8`-`u64`, `i8`-`i64`), strings, pointers, and arrays.
- **Control Flow**: Includes `if`, `else`, `else if`, `loop`, `break`, `continue`.
- **Functions**: Allows defining and calling functions with parameters and return values.
- **Import/Export**: Supports modular programming through import and export statements with automatic dependency compilation.
- **Inline Assembly**: Allows embedding raw assembly code within BPL code for low-level operations with interpolation of BPL variables.
- **Structures and Arrays**: Supports user-defined structures and arrays for complex data management.
- **Array Literals**: Supports initializing arrays with literals `[1, 2, 3]`.
- **Standard Library**: Provides built-in functions for `print`, `exit`, `exec`, `str_len`.
- **Optimization**: Built-in peephole optimizer to generate efficient assembly code.
- **Simple Syntax**: Designed to be easy to read and write, with a syntax similar to C, Go, and Python.

## Example

Here is a simple example of a BPL program that prints "Hello, World!" to the
console:

```bpl
frame main() ret u8 {
    # This is a comment
    call print("Hello, World!\n");
    return 0;
}
```

## Compilation

To compile a BPL program, use `bun index.ts`:

```bash
bun index.ts [options] path/to/your/file.x [lib1.o ...]
```

This will generate an executable file in the same directory as the source file.

### CLI Options

- `-q | --quiet`: Suppress all output except for errors.
- `-p | --print-asm`: Print the generated assembly code to the console and preserve the `.asm` file.
- `-r | --run`: Automatically run the compiled program after successful compilation.
- `-g | --gdb`: Run the compiled program inside GDB for debugging.
- `-l | --lib`: Compile as a shared library instead of an executable, preserve `.o` file.
- `-d | --dynamic`: Compile as a dynamically linked executable (default).
- `-s | --static`: Compile as a static executable (no dynamic linking).
- `--llvm`: Use the LLVM backend to generate LLVM IR instead of assembly.

### Import/Export

BPL supports modular programming through import and export statements. You can split your code into multiple files and import functions and types between them. The compiler automatically handles the compilation of imported files.

**Exporting:**
To make a function or type available to other files, use the `export` keyword.

```bpl
struct Point {
    x: u64,
    y: u64
}
export [Point]; # export type using square brackets

frame add(a: u64, b: u64) ret u64 {
    return a + b;
}
export add; # export function
```

**Importing:**
You can import functions and types from other BPL files using relative paths.

```bpl
import [Point] from "./types.x";
import add from "./math.x";

frame main() ret u8 {
    local p: Point;
    call add(1, 2);
    return 0;
}
```

**Syntax:**

- `import [Type1, Type2] from "./path/to/file.x";` - Import types.
- `import func1, func2 from "./path/to/file.x";` - Import functions.
- `import func1, func2 from "./path/to/file.o"; ` - Import functions from compiled object files.
- `import printf;` - Import external functions (like libc functions).

The compiler recursively resolves imports, compiles the dependencies, and links them into the final executable.

#### Valid syntax for import/export

- `export functionName;` - Export a function.
- `export [TypeName];` - Export a type (struct).
- `import functionName1, functionName2, ...;` - Import external functions.
- `import functionName1, functionName2 from "./path/to/file.x";` - Import functions from a local file.
- `import [Type1], [Type2] from "./path/to/file.x";` - Import types from a local file.

### External Functions (`extern`)

When importing functions from external libraries (like `libc`) or compiled object files (`.o`), the BPL compiler doesn't have access to the function signatures (argument types and return types). By default, it assumes they take no arguments or generic arguments.

To specify the signature of an imported function, use the `extern` keyword. This allows the compiler to perform type checking and correctly handle return values.

```bpl
import printf from "libc";

# Redeclare printf with specific signature
extern printf(fmt: *u8, ...);

frame main() ret u64 {
    call printf("Value: %d\n", 42);
    return 0;
}
```

**Recommendation:** Use `extern` primarily when importing from `libc` or `*.o` files. When importing from other `.x` (BPL source) files, the compiler can automatically infer signatures, so `extern` is usually not necessary unless you need to override them.

### Functions/Frames

Functions in BPL are defined using the `frame` keyword. Frame keyword is used because functions in BPL create stack frames and variable scopes are tied to stack frames.
They can have parameters and return values. Here is an example of a function that adds two numbers:

```bpl
frame add(a: u8, b: u8) ret u8 {
    return a + b;
}
```

or

```bpl
frame noop() {
  call print("No operation performed.\n");
}
```

Functions must specify return type using `ret` keyword. If no return type is specified, function is considered to have `void` return type and ret keyword is omitted.
Functions can be called using the `call` keyword:

```bpl
local result: u8 = call add(5, 10);
call print("Result: %d\n", call add(5, 10));
```

#### Function declaration syntax:

```bpl
frame function_name(param1: type1, param2: type2, ...) ret return_type {}
frame function_name(param1: type1, param2: type2, ...) {} // for void return type
frame function_name() ret return_type {}
frame function_name() {} // for void return type
```

### Variadic Functions

BPL supports defining and calling variadic functions (functions that accept a variable number of arguments).

**Defining a Variadic Function:**

Use `...:type` as the last parameter to define a variadic function. The arguments are accessible via the `args` array-like keyword.

```bpl
frame sum(count: u64, ...:u64) ret u64 {
    local total: u64 = 0;
    local i: u64 = 0;
    loop {
        if i >= count { break; }
        total = total + args[i];
        i = i + 1;
    }
    return total;
}
```

**External Variadic Functions:**

For external functions like `printf`, use `...` in the `extern` declaration.

```bpl
extern printf(fmt: string, ...);
```

### Command Line Arguments and Environment Variables

The `main` function can optionally accept command line arguments and environment variables. It supports `argc` (argument count), `argv` (argument vector), and `envp` (environment pointer). This is supported in both the default assembly backend and the LLVM backend.

```bpl
import getenv;
frame main(argc: i32, argv: **u8, envp: **u8) ret u8 {
    # Print arguments
    local i: i32 = 0;
    loop {
        if i >= argc {
            break;
        }
        call printf("Arg %d: %s\n", i, argv[i]);
        i = i + 1;
    }

    # Get specific environment variable
    local path: *u8 = call getenv("PATH");
    if path != null {
        call printf("PATH: %s\n", path);
    }
    return 0;
}
```

### Variables

Variables in BPL are declared using the `global` and `local` keyword. Here is an example of declaring local and global variables:

```bpl
global global_var: u8 = 10;
frame main() ret u8 {
    local local_var: u8 = 5;
    call print("Global: %d, Local: %d\n", global_var, local_var);
    return 0;
}
```

Local variables are scoped to the function they are declared in, while global variables are accessible from any function. Global variables are initialized at program startup and can be also constants while local variables are initialized when the function is called and can't be constants.

#### Variable declaration syntax:

```bpl
global const var_name: type = initial_value;
global var_name: type = initial_value;
local var_name: type = initial_value;
global var_name: type; // uninitialized global variable
local var_name: type; // uninitialized local variable
```

### Loops and Control Flow

BPL supports standard control flow constructs such as `if`, `else`, `else if`, `loop`, `break`, and `continue`. Loops by default are infinite and can be exited using `break` statement. if-else statements allow conditional execution of code blocks. if statement can be optionally followed by else block. Condition in if statements are not required to be in parentheses, and should evaluate to a boolean value but not explicitly required.
Here is an example of a loop that prints numbers from 0 to 9:

```bpl
frame main() ret u8 {
    local i: u8 = 0;
    loop {
        if i >= 10 {
            break;
        }
        call printf("%d\n", i);
        i = i + 1;
    }
    return 0;
}
```

#### Control flow syntax:

```bpl
if condition {
    // code to execute if condition is true
} else if condition2 {
    // code to execute if condition2 is true
} else { # else block is optional
    // code to execute if condition is false
}
loop {
    // code to execute in the loop
    break; // to exit the loop
    continue; // to skip to the next iteration, default behavior
}
```

### Inline Assembly

BPL allows embedding raw assembly code within BPL code using the `asm` block. This is useful for low-level operations that are not directly supported by BPL. You can also interpolate BPL variables into the assembly code using `(varName)`.
Each variable is interpolated as `[ rbp - offset ]` for local variables and `[ rel varName ]` for global variables so keep that in mind when using inline assembly.
Here is an example of using inline assembly to add two numbers:

```bpl
frame main() ret u8 {
    local a: u8 = 5;
    local b: u8 = 10;
    local result: u8;
    asm {
        mov rax, (a)
        add rax, (b)
        mov (result), rax
    }
    call printf("Result: %d\n", result);
    return 0;
}
```

### Structures and Arrays

BPL supports user-defined structures and arrays for complex data management. Structures can be defined using the `struct` keyword, and arrays can be declared using square brackets `[]`.
Here is an example of defining a structure and using an array:

```bpl
struct Point {
    x: u8;
    y: u8;
}

global points: Point[10];

frame main() ret u8 {
    local i: u8 = 0;
    loop {
        if i >= 10 {
            break;
        }
        points[i].x = i * 2;
        points[i].y = i * 3;
        call printf("Point %d: (%d, %d)\n", i, points[i].x, points[i].y);
        i = i + 1;
    }
    return 0;
}
```

### Strings

BPL supports string literals and string manipulation. Strings are null-terminated byte arrays (`*u8` or `u8[]`).

```bpl
# Read-only string literal (stored in .rodata)
local str_ro: *u8 = "Hello, World!";

# Mutable stack string (initialized from literal)
local str_stack: u8[64] = "Hello, Stack!";
str_stack[0] = 'h'; # Modify character

# Heap string (dynamic)
local str_heap: *u8 = call malloc(128);
call strcpy(str_heap, "Hello, Heap!");
```

### Arithmetic and Logical Operations

BPL supports standard arithmetic operations such as addition arithemetic, comparison, logical, assignment, and bitwise operations. Here are some examples:

```bpl
local a: u8 = 10;
local b: u8 = 5;
# Arithmetic Operations --------------------------------
local sum: u8 = a + b; // Addition
local sub: u8 = a - b; // Subtraction
local prod: u8 = a * b; // Multiplication
local quot: u8 = a / b; // Float Division (returns float)
local intQuot: u8 = a // b; // Integer Division (truncating for int, floor for float)
local rem: u8 = a % b; // Modulus
# Comparison Operations --------------------------------
local isEq: u8 = (a == b); // Equality Comparison
local isGt: u8 = (a > b); // Greater Than Comparison
local isLt: u8 = (a < b); // Less Than Comparison
local isGte: u8 = (a >= b); // Greater Than or Equal
local isLte: u8 = (a <= b); // Less Than or Equal
# Bitwise Operations -----------------------------------
local andRes: u8 = (a && b); // Logical AND
local orRes: u8 = (a || b); // Logical OR
local notRes: u8 = !a; // Logical NOT
local bitAnd: u8 = a & b; // Bitwise AND
local bitOr: u8 = a | b; // Bitwise OR
local bitXor: u8 = a ^ b; // Bitwise XOR
local tildeRes: u8 = ~a; // Bitwise NOT
local leftShift: u8 = a << 1; // Left Shift
local rightShift: u8 = a >> 1; // Right Shift
# Assignment Operations --------------------------------
local assignValue: u8;
assignValue = 20; // Assignment
assignValue += 5; // Addition Assignment
assignValue -= 3; // Subtraction Assignment
assignValue *= 2; // Multiplication Assignment
assignValue /= 4; // Division Assignment
assignValue %= 6; // Modulus Assignment
assignValue ^= 0x0F; // Bitwise XOR Assignment
assignValue &= 0xF0; // Bitwise AND Assignment
assignValue |= 0x0F; // Bitwise OR Assignment
assignValue ~= 0xFF; // Bitwise NOT Assignment
# Dereference and Address-of Operations ----------------
local ptr: u64 = &a; // Address-of Operation
local derefValue: u8 = *(ptr); // Dereference Operation
# Ternary Operator -------------------------------------
local max: u8 = a > b ? a : b;
```

### Optimization

BPL includes a built-in peephole optimizer that automatically improves the generated assembly code. The optimizer runs during the compilation process and applies various rules to reduce code size and improve performance.

**Optimizations include:**

- **Redundant Push/Pop Removal**: Eliminates unnecessary stack operations.
- **Move Optimization**: Simplifies `mov` instructions (e.g., `mov rax, rax` is removed).
- **Zeroing Idioms**: Replaces `mov reg, 0` with `xor reg, reg`.
- **Arithmetic Simplification**: Optimizes operations like adding/subtracting zero or multiplying by one/zero.
- **Jump Optimization**: Removes jumps to the immediately following label.
- **Instruction Strength Reduction**: Replaces expensive operations with cheaper ones (e.g., `add reg, 1` -> `inc reg`).

### Standard Library

BPL provides a simple standard library with built-in functions for common tasks. Currently, the standard library includes:

- `print(string)`: Prints a string to the console.
- `exit(code: u8)`: Exits the program with the given exit code.
- `exec(command: *u8)`: Executes a shell command and returns the output as a string.
- `str_len(str: *u8)`: Returns the length of a null-terminated string.

## More Examples

The `example` directory contains several programs demonstrating various features of BPL:

- `hello-world.x`: Basic "Hello, World!" program.
- `collatz.x`: Calculates Collatz conjecture sequences, demonstrating loops and arithmetic.
- `fib.x`: Generates Fibonacci sequence, demonstrating loops and variables.
- `malloc.x`: Demonstrates manual memory management using `malloc` and `free`.
- `structs_arrays.x`: Shows how to use arrays of structures.
- `linked_list.x`: Implements a linked list using structs and dynamic memory allocation.
- `asm_demo.x`: Demonstrates inline assembly and variable interpolation.
- `operators.x`: Comprehensive test of arithmetic, bitwise, and logical operators.
- `library.x`: A complex example using structs, pointers, and global variables.
- `enterprise_app.x`: A comprehensive example demonstrating almost all language features.
- `sort_input.x`: Reads numbers from stdin and sorts them.
- `exec_demo.x`: Demonstrates executing shell commands.
- `strings_demo.x`: Demonstrates string manipulation capabilities.
- `else_if_demo.x`: Demonstrates `else if` control flow.
- `args_demo.x`: Demonstrates command line arguments handling.
- `env_demo.x`: Demonstrates environment variables handling.
- `division_demo.x`: Demonstrates the difference between float (`/`) and integer (`//`) division.

## Contributing

Contributions to BPL are welcome! If you find a bug or want to add a new feature, please open an issue or submit a pull request on GitHub.

## License

BPL is licensed under the Apache 2.0 License. See the LICENSE file for more information.
