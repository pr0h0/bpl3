# Quick Start Guide

Welcome! This guide will get you writing BPL code in just a few minutes.

## Your First Program

Let's create the traditional "Hello, World!" program.

### Step 1: Create a File

Create a file named `hello.bpl`:

```bash
touch hello.bpl
```

### Step 2: Write the Code

Open the file in your editor and add:

```bpl
# Import the printf function from the C standard library
extern printf(fmt: string, ...);

# The main function is the entry point of every BPL program
frame main() ret int {
    # Print a message to the console
    printf("Hello, World!\n");

    # Return 0 to indicate success
    return 0;
}
```

### Step 3: Compile and Run

```bash
# Compile and run in one command
bpl hello.bpl --run
```

You should see:

```
Hello, World!
```

Congratulations! You've just written and run your first BPL program! 🎉

## Understanding the Code

Let's break down what each part does:

### Comments

```bpl
# This is a single-line comment
```

Comments start with `#` and continue to the end of the line.

### External Functions

```bpl
extern printf(fmt: string, ...);
```

- `extern` declares a function defined elsewhere (in this case, the C standard library)
- `printf` is the function name
- `(fmt: string, ...)` are the parameters
  - `fmt: string` - first parameter named `fmt` of type `string`
  - `...` - variadic, accepts additional arguments

### Function Declaration

```bpl
frame main() ret int {
    // ...
}
```

- `frame` is BPL's keyword for function
- `main` is the function name (the entry point)
- `()` - no parameters
- `ret int` - returns an integer
- `{ }` - function body

### Function Call

```bpl
printf("Hello, World!\n");
```

Calls the `printf` function with a string argument.

### Return Statement

```bpl
return 0;
```

Returns 0 to indicate successful execution.

## Basic Examples

### Variables and Math

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Declare a local variable
    local x: int = 10;
    local y: int = 20;

    # Perform arithmetic
    local sum: int = x + y;

    # Print the result
    printf("Sum: %d\n", sum);

    return 0;
}
```

**Output:**

```
Sum: 30
```

**Key Points:**

- Variables must be declared with `local` or `global`
- Type annotations follow the variable name: `x: int`
- Can initialize during declaration: `x: int = 10`

### Conditionals

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local age: int = 18;

    if (age >= 18) {
        printf("You are an adult\n");
    } else {
        printf("You are a minor\n");
    }

    return 0;
}
```

**Output:**

```
You are an adult
```

**Key Points:**

- Conditions must be in parentheses: `if (condition)`
- Use `{  }` for block statements
- Standard comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`

### Loops

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local i: int = 0;

    # BPL uses 'loop' instead of 'while'
    loop (i < 5) {
        printf("Count: %d\n", i);
        i = i + 1;
    }

    return 0;
}
```

**Output:**

```
Count: 0
Count: 1
Count: 2
Count: 3
Count: 4
```

**Key Points:**

- `loop` is BPL's looping construct
- `loop (condition)` is like `while (condition)` in other languages
- `loop` without condition creates an infinite loop

### Functions

```bpl
extern printf(fmt: string, ...);

# Define a function that adds two numbers
frame add(a: int, b: int) ret int {
    return a + b;
}

frame main() ret int {
    local result: int = add(5, 3);
    printf("Result: %d\n", result);
    return 0;
}
```

**Output:**

```
Result: 8
```

**Key Points:**

- Functions are declared with `frame`
- Parameters have type annotations: `a: int`
- Specify return type with `ret int`
- Functions can be called like `add(5, 3)`

### Structs

```bpl
extern printf(fmt: string, ...);

# Define a struct
struct Point {
    x: int,
    y: int
}

frame main() ret int {
    # Create a struct instance
    local p: Point;
    p.x = 10;
    p.y = 20;

    printf("Point: (%d, %d)\n", p.x, p.y);

    return 0;
}
```

**Output:**

```
Point: (10, 20)
```

**Key Points:**

- Structs are defined with `struct Name { fields }`
- Fields are separated by commas
- Access fields with dot notation: `p.x`

## Common Compilation Options

### Generate LLVM IR Only

```bash
bpl hello.bpl
# Creates hello.ll (LLVM IR file)
```

### Specify Output Name

```bash
bpl hello.bpl -o myprogram
# Creates 'myprogram' executable
```

### Verbose Output

```bash
bpl hello.bpl -v --run
# Shows detailed compilation steps
```

### View Different Outputs

```bash
# View AST (Abstract Syntax Tree)
bpl hello.bpl --emit ast

# View tokens
bpl hello.bpl --emit tokens

# View formatted code
bpl hello.bpl --emit formatted
```

## Project Structure

For larger programs, organize your code:

```
myproject/
├── main.bpl           # Entry point
├── utils.bpl          # Utility functions
└── types.bpl          # Type definitions
```

**main.bpl:**

```bpl
import add from "./utils.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local result: int = add(5, 3);
    printf("Result: %d\n", result);
    return 0;
}
```

**utils.bpl:**

```bpl
export add;

frame add(a: int, b: int) ret int {
    return a + b;
}
```

Compile with:

```bash
bpl main.bpl --run
```

## Using the Standard Library

BPL comes with a standard library:

```bpl
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("Hello from stdlib!");
    IO.printInt(42);
    return 0;
}
```

**Key standard library modules:**

- `std/io.bpl` - Input/output operations
- `std/array.bpl` - Dynamic arrays
- `std/string.bpl` - String utilities
- `std/math.bpl` - Math functions
- `std/fs.bpl` - File system operations

See [Standard Library documentation](28-stdlib-io.md) for complete details.

## Interactive Development

For quick experimentation, you can use the `--run` flag for immediate feedback:

```bash
# Edit, compile, run in one command
bpl mycode.bpl --run

# Combine with watch tools for auto-recompilation (Unix-like systems)
while inotifywait -e modify mycode.bpl; do bpl mycode.bpl --run; done
```

## Common Beginner Mistakes

### 1. Missing semicolons

```bpl
# ❌ Wrong
local x: int = 5
printf("x = %d\n", x)

# ✅ Correct
local x: int = 5;
printf("x = %d\n", x);
```

### 2. Forgetting 'local' or 'global'

```bpl
# ❌ Wrong
x: int = 5;

# ✅ Correct
local x: int = 5;
```

### 3. Missing parentheses in conditions

```bpl
# ❌ Wrong
if x > 5 {
    // ...
}

# ✅ Correct
if (x > 5) {
    // ...
}
```

### 4. Wrong loop syntax

```bpl
# ❌ Wrong (C-style for loop doesn't exist)
for (i = 0; i < 10; i++) {
    // ...
}

# ✅ Correct
local i: int = 0;
loop (i < 10) {
    // ...
    i = i + 1;
}
```

### 5. Forgetting return type

```bpl
# ❌ Wrong
frame add(a: int, b: int) {
    return a + b;
}

# ✅ Correct
frame add(a: int, b: int) ret int {
    return a + b;
}
```

## What's Next?

Now that you know the basics, you can:

1. **Learn the details** - Read [Types and Variables](05-types-variables.md)
2. **Explore examples** - Check out the [examples directory](../examples/)
3. **Build something** - Try implementing a small project
4. **Read advanced topics** - Dive into [Generics](10-generics-functions.md) or [Pointers](15-pointers.md)

## Getting Help

- **Documentation** - You're in the right place!
- **Examples** - See working code in `examples/`
- **Community** - Join discussions on GitHub
- **Issues** - Report bugs or ask questions

Happy coding! 🚀
