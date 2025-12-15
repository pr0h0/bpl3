# Syntax and Comments

This guide covers the fundamental syntax rules and commenting styles in BPL.

## File Encoding

BPL source files:

- Should be UTF-8 encoded
- Use `.bpl` extension
- Line endings can be LF (Unix) or CRLF (Windows)

## Basic Syntax Rules

### Statements

Most statements in BPL end with a semicolon (`;`):

```bpl
local x: int = 42;              # Variable declaration
printf("Hello\n");              # Function call
return 0;                       # Return statement
```

**Exceptions** (no semicolon needed):

- Block statements (`{ }`)
- Function/struct declarations
- Control flow structures (if, loop, switch)

```bpl
if (x > 0) {          # No semicolon after '}'
    return x;
}                     # No semicolon after '}'

frame test() {        # No semicolon after '}'
    local y: int = 5;
}                     # No semicolon after '}'
```

### Blocks

Blocks are delimited by curly braces and can contain multiple statements:

```bpl
{
    local x: int = 1;
    local y: int = 2;
    local z: int = x + y;
}
```

### Whitespace

BPL is **whitespace-insensitive** (except in strings):

```bpl
# These are all equivalent
local x:int=42;
local x: int = 42;
local x : int = 42 ;

frame add(a:int,b:int)ret int{return a+b;}
frame add(a: int, b: int) ret int {
    return a + b;
}
```

**Best practice**: Use whitespace for readability (see [Coding Conventions](40-coding-conventions.md)).

### Identifiers

Identifiers (names for variables, functions, types, etc.) must:

- Start with a letter (`a-z`, `A-Z`) or underscore (`_`)
- Contain only letters, digits (`0-9`), and underscores
- Not be a reserved keyword

```bpl
# ✅ Valid identifiers
myVariable
_private
count123
MAX_VALUE
camelCase
snake_case

# ❌ Invalid identifiers
123start          # Cannot start with digit
my-variable       # Hyphens not allowed
struct             # Reserved keyword
```

**Reserved Keywords** (cannot be used as identifiers):

```
frame    local    global   import   export   extern
return   if       else     loop     switch   case
default  try      catch    catchOther throw  break
continue cast     sizeof   match    type     struct
true     false    null     nullptr  ret      this
```

### Case Sensitivity

BPL is **case-sensitive**:

```bpl
local myvar: int = 1;
local MyVar: int = 2;
local MYVAR: int = 3;

# These are three different variables
printf("%d %d %d\n", myvar, MyVar, MYVAR);  # Prints: 1 2 3
```

## Comments

Comments are portions of code ignored by the compiler, used for documentation and explanations.

### Single-Line Comments

Start with `#` and continue to the end of the line:

```bpl
# This is a single-line comment

local x: int = 42;  # This is also a comment

# You can have multiple consecutive comments
# Each line needs its own # symbol
# Like this
```

Single-line comments can appear anywhere:

```bpl
local x: int = 42;   # Initialize x
                     # More explanation
if (x > 0) {         # Check if positive
    printf("Positive\n");
}  # end if
```

### Multi-Line Comments

Enclosed between `###` delimiters:

```bpl
###
This is a multi-line comment.
It can span multiple lines.
Everything between ### markers is ignored.
###

frame main() ret int {
    ###
    You can put multi-line comments
    inside function bodies too.
    ###
    return 0;
}
```

### Documentation Comments

While BPL doesn't have special doc comment syntax (like `///` or `/**`), you can use comments for documentation:

```bpl
###
Function: calculateSum
Purpose: Adds two integers and returns the result
Parameters:
  - a: First integer
  - b: Second integer
Returns: Sum of a and b
###
frame calculateSum(a: int, b: int) ret int {
    return a + b;
}
```

### Nested Comments

Multi-line comments **DO NOT NEST**:

```bpl
###
This is a comment
  ### This starts a NEW comment, closing the previous one
  This text is NOT commented!
###
```

To comment out code containing comments, use single-line comments:

```bpl
# ###
# local x: int = 42;  # Initialize
# ###
```

## Comment Best Practices

### 1. Explain Why, Not What

```bpl
# ❌ Bad - Obvious what the code does
local count: int = 0;  # Set count to 0

# ✅ Good - Explains why
local count: int = 0;  # Reset for next iteration
```

### 2. Keep Comments Up-to-Date

```bpl
# ❌ Bad - Comment doesn't match code
# Calculate average
local sum: int = a + b;  # This just sums, doesn't average!

# ✅ Good
# Calculate sum of inputs
local sum: int = a + b;
```

### 3. Use Comments for Complex Logic

```bpl
# Convert RGB to grayscale using luminance formula
# Human eye is more sensitive to green (0.59) than red (0.30) or blue (0.11)
local gray: int = cast<int>((r * 0.30) + (g * 0.59) + (b * 0.11));
```

### 4. Comment Temporary Code

```bpl
# TODO: Optimize this algorithm (currently O(n²))
# FIXME: Handle edge case when array is empty
# HACK: Temporary workaround for issue #123
# NOTE: This assumes input is always positive
```

### 5. Section Dividers

Use comments to organize code into sections:

```bpl
# ========================================
# Configuration Constants
# ========================================
global MAX_USERS: int = 100;
global TIMEOUT_MS: int = 5000;

# ========================================
# Helper Functions
# ========================================
frame validateInput(x: int) ret bool {
    return x >= 0;
}
```

## String Literals

Strings are enclosed in double quotes and support escape sequences:

```bpl
local msg: string = "Hello, World!";
local path: string = "C:\\Users\\Documents";  # Escaped backslash
local quote: string = "He said \"Hello\"";    # Escaped quotes
local newline: string = "Line 1\nLine 2";     # Newline character
```

**Common escape sequences:**

- `\n` - Newline
- `\t` - Tab
- `\\` - Backslash
- `\"` - Double quote
- `\r` - Carriage return
- `\0` - Null terminator

## Character Literals

Single characters are enclosed in single quotes:

```bpl
local ch: char = 'A';
local newline: char = '\n';
local tab: char = '\t';
local quote: char = '\'';  # Escaped single quote
```

## Number Literals

### Integer Literals

```bpl
local decimal: int = 42;        # Decimal
local negative: int = -100;     # Negative
local zero: int = 0;            # Zero
```

BPL does **not** currently support:

- Hexadecimal literals (`0x2A`)
- Octal literals (`0o52`)
- Binary literals (`0b101010`)
- Number separators (`1_000_000`)

Use decimal only.

### Floating-Point Literals

```bpl
local pi: float = 3.14159;
local small: float = 0.001;
local large: float = 1000.0;
local negative: float = -2.5;
```

BPL does **not** currently support:

- Scientific notation (`1.5e10`)
- Float suffixes (`3.14f`)

## Boolean Literals

```bpl
local isTrue: bool = true;
local isFalse: bool = false;
```

## Null Literals

```bpl
local ptr: *int = null;         # Generic null
local ptr2: *int = nullptr;     # Pointer-specific null
```

**Difference:**

- `null` - General null value
- `nullptr` - Specifically for pointers (more type-safe)

## Statements vs Expressions

### Statements

Actions that don't produce a value:

- Variable declarations
- Function calls (used as statements)
- Return statements
- Control flow (if, loop, etc.)

```bpl
local x: int = 5;         # Statement
printf("Hello\n");        # Statement
return 0;                 # Statement
```

### Expressions

Computations that produce a value:

- Literals (`42`, `"hello"`, `true`)
- Variables (`x`, `myVar`)
- Operators (`a + b`, `x > 5`)
- Function calls (`add(1, 2)`)
- Ternary (`x > 0 ? 1 : -1`)

```bpl
42                        # Expression
x + y                     # Expression
add(5, 3)                 # Expression
x > 0 ? "pos" : "neg"     # Expression
```

Expressions can be used as statements:

```bpl
add(5, 3);    # Expression used as statement (value discarded)
x + y;        # Valid but useless (value discarded)
```

## Line Continuation

BPL doesn't have explicit line continuation. Break long lines naturally:

```bpl
# ✅ Break at operators
local result: int = longVariableName +
                    anotherLongName +
                    yetAnotherValue;

# ✅ Break at commas
frame myFunction(
    param1: int,
    param2: string,
    param3: bool
) ret int {
    return 0;
}

# ✅ Break in function calls
printf("Long message: %d %d %d\n",
       firstValue,
       secondValue,
       thirdValue);
```

## Code Organization

### File Structure

Typical BPL file structure:

```bpl
# File: mymodule.bpl

# 1. Comments/documentation
###
Module: mymodule
Description: Provides utility functions
###

# 2. Imports
import [Helper] from "./helper.bpl";
extern printf(fmt: string, ...);

# 3. Type definitions
struct MyStruct {
    value: int
}

type MyAlias = int;

# 4. Global variables
global CONSTANT: int = 100;

# 5. Functions
frame myFunction() ret int {
    return 0;
}

# 6. Exports
export myFunction;
export [MyStruct];
```

## Summary

**Key Syntax Rules:**

- Most statements end with `;`
- Blocks use `{ }`
- Whitespace is generally ignored
- Case-sensitive identifiers
- Comments: `#` for single-line, `###` for multi-line

**Next Steps:**

- [Types and Variables](05-types-variables.md) - Learn about data types
- [Operators](06-operators.md) - Understand operators and expressions
- [Coding Conventions](40-coding-conventions.md) - Style guidelines

## Examples

See these examples for more syntax patterns:

- `examples/hello-world/` - Basic syntax
- `examples/primitives/` - Literals and types
- `examples/globals/` - Global variables
