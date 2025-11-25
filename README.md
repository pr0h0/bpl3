# BPL 3

## The Best Programming Language v3

BPL is a simple programming language that compiles to x86-64 assembly. It is designed to be easy to learn and use, while still being powerful enough to write complex programs.

## Installation

To install BPL, you need to have `Bun`, `nasm` and `ld` installed on your system.

- Clone the repository
- Install the dependencies
- Check if everything is working

```bash
git clone https://github.com/pr0h0/bpl3.git
cd bpl3
bun install
./cmp.sh example/hello-world.x
./example/hello-world
```

You should see "Hello, World!" printed to the console.
More examples can be found in the `example` directory.

## Language Features

- Variables and Data Types: Supports integers, strings, pointers, and arrays.
- Control Flow: Includes if-else statements, loops.
- Functions: Allows defining and calling functions with parameters and return values.
- Import/Export: Supports modular programming through import and export statements.
- Inline Assembly: Allows embedding raw assembly code within BPL code for low-level operations with interpolation of BPL variables.
- Structures and Arrays: Supports user-defined structures and arrays for complex data management.
- Standard Library: Provides built-in functions for `print` and `exit`
- Simple Syntax: Designed to be easy to read and write, with a syntax similar to C, Go, and Python.

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

To compile a BPL program, use the provided `cmp.sh` script:

```bash
./cmp.sh path/to/your/file.x
```

This will generate an executable file in the same directory as the source file.

There are several options you can pass to the compiler:

- `-q|--quiet`: Suppress all output except for errors.
- `-p|--print-asm`: Print the generated assembly code to the console and preseve the file.
- `-r|--run`: Automatically run the compiled program after successful compilation.
- `-g|--gdb`: Run the compiled program inside GDB for debugging.
- `-l|--lib`: Compile as a shared library instead of an executable, preserve .o file.

You can add cmp.sh to your PATH for easier access by adding the following line to your shell configuration file (e.g., `.bashrc`, `.zshrc`):

```bash
   export PATH="$PATH:/path/to/bpl3"
```

After adding this line, run `source ~/.bashrc` or `source ~/.zshrc` to apply the changes. Then you can use `cmp.sh` from any directory.

### Import/Export

BPL supports modular programming through import and export statements. You can define functions in one file and use them in another. For example, you can create a file `math.x` with the following content:

```bpl
frame add(a u8, b u8) ret u8 {
    return a + b;
}
export add;
```

Then, in another file, you can import and use the `add` function:

```bpl
import add, printf;

frame main() ret u8 {
    local result: u8 = call add(5, 10);
    call printf("Result: %d\n", result);
    return 0;
}
```

If you have export in your file, no main method should be present and file should not be compiled as executable but only as library.
When compiling, make sure to include the path to the imported files.

```bash
./cmp.sh -l path/to/your/math.x
./cmp.sh path/to/your/main.x path/to/your/math.o
```

#### Valid syntax for import/export

- `export functionName;` - Export can export only single function at a time, multiple export statements can be used.
- `import functionName1, functionName2, ...;` - Import can import multiple functions at once. Functions are resolved during compilation so functions from the multiple files can be imported in one statement.
- `import functionName1, functionName2, ... from "some/path/to/file.x";` - From clause is ignored during compilation, it is only for better readability.

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

BPL supports standard control flow constructs such as `if`, `else`, `loop`, `break`, and `continue`. Loops by default are infinite and can be exited using `break` statement. if-else statements allow conditional execution of code blocks. if statement can be optionally followed by else block. Condition in if statements are not required to be in parentheses, and should evaluate to a boolean value but not explicitly required.
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

### Arithmetic and Logical Operations

BPL supports standard arithmetic operations such as addition arithemetic, comparison, logical, assignment, and bitwise operations. Here are some examples:

```bpl
local a: u8 = 10;
local b: u8 = 5;
# Arithmetic Operations --------------------------------
local sum: u8 = a + b; // Addition
local sub: u8 = a - b; // Subtraction
local prod: u8 = a * b; // Multiplication
local quot: u8 = a / b; // Integer Division with truncation
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
```

### Standard Library

BPL provides a simple standard library with built-in functions for common tasks. Currently, the standard library includes:

- `print(string)`: Prints a string to the console.
- `exit(code: u8)`: Exits the program with the given exit code.

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

## Contributing

Contributions to BPL are welcome! If you find a bug or want to add a new feature, please open an issue or submit a pull request on GitHub.

## License

BPL is licensed under the MIT License. See the LICENSE file for more information.
