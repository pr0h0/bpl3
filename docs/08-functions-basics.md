# Functions - Basics

Functions (called "frames" in BPL) are the primary means of code organization and reusability. This guide covers the fundamentals of function declaration, definition, and usage.

## Table of Contents

- [Function Declaration](#function-declaration)
- [Function Definition](#function-definition)
- [Calling Functions](#calling-functions)
- [Return Values](#return-values)
- [Parameters](#parameters)
- [Extern Functions](#extern-functions)
- [Forward Declarations](#forward-declarations)
- [Function Scope](#function-scope)

## Function Declaration

In BPL, functions are declared using the `frame` keyword.

### Basic Syntax

```bpl
frame functionName(parameters) ret returnType {
    # Function body
}
```

**Components:**

- `frame`: BPL's keyword for functions
- `functionName`: Identifier for the function
- `parameters`: Comma-separated list of typed parameters
- `ret returnType`: Return type specification
- `{ }`: Function body containing statements

### Simple Example

```bpl
frame greet() ret void {
    printf("Hello!\n");
}
```

### With Parameters

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}
```

### No Parameters

```bpl
frame getCurrentTime() ret long {
    return time(null);
}
```

## Function Definition

A complete function definition includes the signature and body.

### Void Functions

Functions that don't return a value use `ret void`:

```bpl
frame printMessage(msg: string) ret void {
    printf("%s\n", msg);
}

frame clearScreen() ret void {
    printf("\033[2J\033[H");
}
```

**Returning from void functions:**

```bpl
frame logError(code: int, msg: string) ret void {
    if (code == 0) {
        return;  # Early exit, no value needed
    }
    fprintf(stderr, "Error %d: %s\n", code, msg);
}
```

### Returning Values

Functions must return a value of the declared type:

```bpl
frame square(x: int) ret int {
    return x * x;
}

frame divide(a: float, b: float) ret float {
    if (b == 0.0) {
        return 0.0;  # Error handling
    }
    return a / b;
}
```

### Multiple Return Points

Functions can have multiple return statements:

```bpl
frame max(a: int, b: int) ret int {
    if (a > b) {
        return a;
    }
    return b;
}

frame sign(x: int) ret int {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
}
```

## Calling Functions

### Basic Call

```bpl
# Call void function
greet();

# Call function and use return value
local sum: int = add(5, 3);

# Call function in expression
local result: int = square(x) + square(y);
```

### Chaining Calls

```bpl
# Result of one function used as argument to another
local result: int = max(abs(x), abs(y));

# Multiple calls in expression
local avg: float = divide(add(a, b), 2.0);
```

### Discarding Return Values

```bpl
# Return value is discarded
add(5, 3);  # Warning: unused return value

# Common with I/O functions
printf("Hello\n");  # Returns number of characters, usually ignored
```

## Return Values

### Primitive Types

```bpl
frame getAge() ret int {
    return 25;
}

frame getPI() ret float {
    return 3.14159;
}

frame getInitial() ret char {
    return 'J';
}

frame isValid() ret bool {
    return true;
}
```

### Structs

Functions can return struct values:

```bpl
struct Point {
    x: int;
    y: int;
}

frame createPoint(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;  # Returns a copy
}

# Usage
local p: Point = createPoint(10, 20);
```

### Pointers

```bpl
frame allocateBuffer(size: int) ret char* {
    return cast<char*>(malloc(size));
}

frame findMax(arr: int*, size: int) ret int* {
    if (size == 0) {
        return null;
    }
    local maxPtr: int* = &arr[0];
    loop (local i: int = 1; i < size; i++) {
        if (arr[i] > *maxPtr) {
            maxPtr = &arr[i];
        }
    }
    return maxPtr;
}
```

**Important:** Returning pointers to local variables is undefined behavior:

```bpl
# DANGEROUS - Returns pointer to local variable
frame getBadPointer() ret int* {
    local x: int = 42;
    return &x;  # x is destroyed when function returns!
}

# SAFE - Returns pointer to static or heap memory
frame getGoodPointer() ret int* {
    return cast<int*>(malloc(sizeof(int)));
}
```

### Arrays

Arrays cannot be returned directly. Return a pointer instead:

```bpl
# ERROR - Cannot return array
frame createArray() ret int[10] {
    local arr: int[10];
    return arr;  # ERROR
}

# CORRECT - Return pointer
frame createArray() ret int* {
    local arr: int* = cast<int*>(malloc(10 * sizeof(int)));
    loop (local i: int = 0; i < 10; i++) {
        arr[i] = i;
    }
    return arr;
}
```

## Parameters

### By Value

Parameters are passed by value by default (copied):

```bpl
frame increment(x: int) ret void {
    x++;  # Modifies local copy, not original
}

local a: int = 5;
increment(a);
printf("%d\n", a);  # Prints 5, not 6
```

### By Pointer (Reference-like)

To modify the original value, pass a pointer:

```bpl
frame increment(x: int*) ret void {
    *x = *x + 1;  # Modifies original through pointer
}

local a: int = 5;
increment(&a);
printf("%d\n", a);  # Prints 6
```

### Multiple Parameters

```bpl
frame printPoint(x: int, y: int, z: int) ret void {
    printf("(%d, %d, %d)\n", x, y, z);
}

frame calculateVolume(length: float, width: float, height: float) ret float {
    return length * width * height;
}
```

### Array Parameters

Arrays are passed as pointers:

```bpl
frame sumArray(arr: int*, size: int) ret int {
    local total: int = 0;
    loop (local i: int = 0; i < size; i++) {
        total += arr[i];
    }
    return total;
}

# Usage
local numbers: int[5] = [1, 2, 3, 4, 5];
local sum: int = sumArray(numbers, 5);
```

**Array decay:**

```bpl
frame printFirst(arr: int[10]) ret void {
    # arr decays to int*
    printf("%d\n", arr[0]);
}
```

### Struct Parameters

Structs can be passed by value or by pointer:

```bpl
struct Point {
    x: int;
    y: int;
}

# By value (copies the struct)
frame printPointByValue(p: Point) ret void {
    printf("(%d, %d)\n", p.x, p.y);
    p.x = 0;  # Doesn't affect original
}

# By pointer (no copy)
frame printPointByPointer(p: Point*) ret void {
    printf("(%d, %d)\n", p->x, p->y);
}

# By pointer for modification
frame move(p: Point*, dx: int, dy: int) ret void {
    p->x += dx;
    p->y += dy;
}
```

### Const Parameters

BPL doesn't have `const`, but convention is to use pointers for large structs even when not modifying:

```bpl
# Pass by pointer to avoid copying, but don't modify
frame getDistance(p1: Point*, p2: Point*) ret float {
    local dx: int = p1->x - p2->x;
    local dy: int = p1->y - p2->y;
    return sqrt(cast<float>(dx * dx + dy * dy));
}
```

## Extern Functions

Use `extern` to declare functions defined elsewhere (e.g., C standard library):

### Standard Library Functions

```bpl
# <stdio.h>
extern printf(format: string, ...) ret int;
extern scanf(format: string, ...) ret int;
extern fopen(filename: string, mode: string) ret void*;
extern fclose(file: void*) ret int;

# <stdlib.h>
extern malloc(size: int) ret void*;
extern free(ptr: void*) ret void;
extern exit(code: int) ret void;

# <string.h>
extern strlen(str: string) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcmp(s1: string, s2: string) ret int;

# <math.h>
extern sqrt(x: float) ret float;
extern pow(base: float, exp: float) ret float;
extern sin(x: float) ret float;
```

### Variadic Functions

Functions with variable arguments use `...`:

```bpl
extern printf(format: string, ...) ret int;

printf("Hello\n");
printf("Value: %d\n", 42);
printf("x=%d, y=%d\n", x, y);
```

**Note:** BPL doesn't support defining your own variadic functions, only calling extern ones.

### Linking

Extern functions must be available at link time:

```sh
# Link with math library
bpl compile -o program main.bpl -lm

# Link with custom library
bpl compile -o program main.bpl -L./lib -lmylib
```

## Forward Declarations

BPL requires functions to be declared before use. Use forward declarations when needed:

### Basic Forward Declaration

```bpl
# Forward declaration
frame helper(x: int) ret int;

frame main() ret int {
    local result: int = helper(5);  # Can call before definition
    return result;
}

# Actual definition
frame helper(x: int) ret int {
    return x * 2;
}
```

### Mutual Recursion

Forward declarations enable mutual recursion:

```bpl
# Forward declarations
frame isEven(n: int) ret bool;
frame isOdd(n: int) ret bool;

frame isEven(n: int) ret bool {
    if (n == 0) return true;
    return isOdd(n - 1);
}

frame isOdd(n: int) ret bool {
    if (n == 0) return false;
    return isEven(n - 1);
}
```

### Circular Dependencies

```bpl
frame processA(x: int) ret int;  # Forward declaration

frame processB(x: int) ret int {
    if (x < 0) {
        return processA(-x);
    }
    return x * 2;
}

frame processA(x: int) ret int {
    if (x > 10) {
        return processB(x - 10);
    }
    return x + 1;
}
```

## Function Scope

### Local Variables

Variables declared in a function are local to that function:

```bpl
frame example() ret void {
    local x: int = 10;  # Local to example()
    local y: int = 20;  # Local to example()
}

# ERROR: x and y are not accessible here
```

### Nested Scopes

```bpl
frame demo() ret void {
    local x: int = 10;

    if (true) {
        local y: int = 20;  # Scoped to if block
        printf("%d %d\n", x, y);  # Can access both
    }

    # ERROR: y is not accessible here
    printf("%d\n", x);  # OK
}
```

### Parameter Scope

Parameters are scoped to the function body:

```bpl
frame process(data: int*, size: int) ret void {
    # data and size are accessible throughout function
    local i: int = 0;
    loop (i < size) {
        process(data[i]);
        i++;
    }
}
```

### Static Variables

BPL doesn't have static local variables. Use global variables instead:

```bpl
local callCount: int = 0;  # Global

frame increment() ret void {
    callCount++;
    printf("Called %d times\n", callCount);
}
```

## Common Patterns

### Swap Function

```bpl
frame swap(a: int*, b: int*) ret void {
    local temp: int = *a;
    *a = *b;
    *b = temp;
}

# Usage
local x: int = 5;
local y: int = 10;
swap(&x, &y);
printf("x=%d, y=%d\n", x, y);  # x=10, y=5
```

### Min/Max Functions

```bpl
frame min(a: int, b: int) ret int {
    return (a < b) ? a : b;
}

frame max(a: int, b: int) ret int {
    return (a > b) ? a : b;
}

frame clamp(value: int, low: int, high: int) ret int {
    return max(low, min(value, high));
}
```

### Validation Functions

```bpl
frame isValidAge(age: int) ret bool {
    return age >= 0 && age <= 150;
}

frame isValidEmail(email: string) ret bool {
    # Simplified validation
    return strchr(email, '@') != null;
}
```

### Initialization Functions

```bpl
struct Config {
    width: int;
    height: int;
    fullscreen: bool;
}

frame initConfig(cfg: Config*) ret void {
    cfg->width = 800;
    cfg->height = 600;
    cfg->fullscreen = false;
}

# Usage
local cfg: Config;
initConfig(&cfg);
```

## Best Practices

1. **One purpose per function** - Functions should do one thing well
2. **Descriptive names** - Use verb phrases: `calculateTotal`, `validateInput`
3. **Limit parameters** - More than 4-5 parameters suggests refactoring needed
4. **Limit length** - Functions longer than 50 lines often need splitting
5. **Use pointers for large structs** - Avoid copying large amounts of data
6. **Check pointer parameters** - Validate pointers aren't null before dereferencing
7. **Return early** - Exit quickly for error cases
8. **Consistent return** - All paths should return a value (non-void functions)
9. **Avoid side effects** - Functions should be predictable
10. **Document complex functions** - Add comments explaining algorithm or edge cases

## Common Mistakes

### Returning Local Address

```bpl
# WRONG
frame getBadPointer() ret int* {
    local x: int = 42;
    return &x;  # Dangling pointer!
}

# CORRECT
frame getGoodPointer() ret int* {
    return cast<int*>(malloc(sizeof(int)));
}
```

### Not Returning a Value

```bpl
# ERROR: Control reaches end of non-void function
frame calculate(x: int) ret int {
    if (x > 0) {
        return x * 2;
    }
    # Missing return for x <= 0 case!
}

# CORRECT
frame calculate(x: int) ret int {
    if (x > 0) {
        return x * 2;
    }
    return 0;  # Handle all cases
}
```

### Passing Large Structs by Value

```bpl
struct LargeData {
    values: int[1000];
}

# Inefficient: Copies 4000 bytes
frame process(data: LargeData) ret void {
    # ...
}

# Efficient: Passes pointer (8 bytes)
frame process(data: LargeData*) ret void {
    # ...
}
```

## Next Steps

- [Functions Advanced](09-functions-advanced.md) - Overloading, recursion, function pointers
- [Structs](11-structs.md) - Defining and using structures
- [Pointers](15-pointers.md) - Deep dive into pointer operations
