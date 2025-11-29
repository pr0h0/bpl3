# BPL Syntax Guide

This document provides a comprehensive reference for the BPL programming language syntax.

## Comments

Comments start with `#` and extend to the end of the line.

```bpl
# This is a comment
local x: u64 = 10; # Inline comment
```

## Data Types

BPL supports the following primitive types:

- **Unsigned Integers**: `u8`, `u16`, `u32`, `u64`
- **Signed Integers**: `i8`, `i16`, `i32`, `i64` (Note: currently mostly treated as unsigned in some contexts, but syntax is supported)
- **Pointers**: `*Type` (e.g., `*u8` for a string/byte pointer)
- **Arrays**: `Type[Size]` (e.g., `u64[10]`)
- **Structs**: User-defined types.

## Variables

Variables can be declared in global or local scope.

### Global Variables

Global variables are accessible from anywhere. They must be initialized with a constant value.

```bpl
global counter: u64 = 0;
global message: *u8 = "Global String";
```

### Local Variables

Local variables are declared inside functions (`frame`).

```bpl
frame main() ret u8 {
    local x: u64 = 42;
    local y: u64; # Uninitialized
    y = 100;
    return 0;
}
```

## Functions (`frame`)

Functions are defined using the `frame` keyword.

### Syntax

```bpl
frame function_name(param1: Type, param2: Type) ret ReturnType {
    # Body
    return value;
}
```

If a function does not return a value, omit the `ret ReturnType` part.

```bpl
frame log_message(msg: *u8) {
    call print(msg);
}
```

### Calling Functions

Use the `call` keyword to invoke a function.

```bpl
call log_message("Hello");
local result: u64 = call add(10, 20);
```

### Variadic Functions

You can define functions that take a variable number of arguments using the `...:Type` syntax as the last parameter.

```bpl
frame sum(count: u64, ...:u64) ret u64 {
    local total: u64 = 0;
    local i: u64 = 0;
    loop {
        if i >= count { break; }
        # Access variadic arguments using 'args[index]'
        total = total + args[i];
        i = i + 1;
    }
    return total;
}
```

## Extern Keyword

The `extern` keyword is used to declare the signature of functions that are imported from external sources (like C libraries or object files) where the source code is not available to the BPL compiler.

```bpl
import printf from "libc";
extern printf(fmt: *u8); # Define argument types
```

This ensures correct type checking and calling convention usage.

## Control Flow

### If-Else

```bpl
if x > 10 {
    call print("Greater than 10");
} else if x == 10 {
    call print("Equal to 10");
} else {
    call print("Less than 10");
}
```

### Loops

The `loop` construct creates an infinite loop. Use `break` to exit and `continue` to skip to the next iteration.

```bpl
local i: u64 = 0;
loop {
    if i >= 10 {
        break;
    }
    call print("%d\n", i);
    i = i + 1;
}
```

## Structs

Structs allow grouping related data.

```bpl
struct Point {
    x: u64,
    y: u64
}

frame main() ret u8 {
    local p: Point;
    p.x = 10;
    p.y = 20;
    return 0;
}
```

## Arrays

Arrays are fixed-size blocks of memory.

```bpl
global numbers: u64[5];

frame main() ret u8 {
    numbers[0] = 100;
    local val: u64 = numbers[0];

    # Array of structs
    local points: Point[3];
    points[0].x = 1;
    return 0;
}
```

## Pointers

Use `&` to get the address of a variable and `*` to dereference.

```bpl
local x: u64 = 10;
local ptr: *u64 = &x;
local val: u64 = *ptr;
```

## Operators

### Arithmetic

`+`, `-`, `*`, `/`, `%`

### Comparison

`==`, `!=`, `<`, `>`, `<=`, `>=`

### Logical

`&&`, `||`, `!`

### Bitwise

`&`, `|`, `^`, `~`, `<<`, `>>`

### Assignment

`=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`

### Ternary

`condition ? true_val : false_val`

```bpl
local max: u64 = a > b ? a : b;
```
