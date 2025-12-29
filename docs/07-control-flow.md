# Control Flow

Control flow statements determine the execution order of code. BPL provides familiar control structures with some unique syntax choices.

## Table of Contents

- [If Statements](#if-statements)
- [Loop Statements](#loop-statements)
- [Switch Statements](#switch-statements)
- [Match Expressions](#match-expressions)
- [Break and Continue](#break-and-continue)
- [Return Statement](#return-statement)
- [Anonymous Blocks](#anonymous-blocks)

## If Statements

### Basic If

```bpl
local condition: bool = true;
if (condition) {
    # Execute if condition is true
}
```

Example:

```bpl
local age: int = 20;

if (age >= 18) {
    printf("You are an adult\n");
}
```

### If-Else

```bpl
local condition: bool = true;
if (condition) {
    # Execute if true
} else {
    # Execute if false
}
```

Example:

```bpl
local temperature: int = 35;
if (temperature > 30) {
    printf("It's hot\n");
} else {
    printf("It's not hot\n");
}
```

### Else-If Chains

```bpl
local condition1: bool = false;
local condition2: bool = true;
local condition3: bool = false;

if (condition1) {
    # Execute if condition1 is true
} else if (condition2) {
    # Execute if condition1 is false and condition2 is true
} else if (condition3) {
    # Execute if conditions 1 and 2 are false, and condition3 is true
} else {
    # Execute if all conditions are false
}
```

Example:

```bpl
local score: int = 85;
if (score >= 90) {
    printf("Grade: A\n");
} else if (score >= 80) {
    printf("Grade: B\n");
} else if (score >= 70) {
    printf("Grade: C\n");
} else if (score >= 60) {
    printf("Grade: D\n");
} else {
    printf("Grade: F\n");
}
```

### Nested If Statements

```bpl
local hasAccount: bool = true;
local isLoggedIn: bool = true;
local hasPermission: bool = true;

if (hasAccount) {
    if (isLoggedIn) {
        if (hasPermission) {
            printf("Access granted\n");
        } else {
            printf("Insufficient permissions\n");
        }
    } else {
        printf("Please log in\n");
    }
} else {
    printf("Please create an account\n");
}
```

**Better alternative using logical operators:**

```bpl
local hasAccount: bool = true;
local isLoggedIn: bool = true;
local hasPermission: bool = true;

if (hasAccount && isLoggedIn && hasPermission) {
    printf("Access granted\n");
} else if (hasAccount && isLoggedIn) {
    printf("Insufficient permissions\n");
} else if (hasAccount) {
    printf("Please log in\n");
} else {
    printf("Please create an account\n");
}
```

### Truthiness in Conditions

Conditions are "truthy" based on these rules:

```bpl
# Numbers: 0 is false, non-zero is true
local x: int = 5;
if (x != 0) {  # true
    printf("x is non-zero\n");
}

# Pointers: nullptr is false, non-nullptr is true
local p: *int = nullptr;
if (p != nullptr) {  # false
    printf("p is not nullptr\n");
}

# Explicit comparison (preferred for clarity)
if (x != 0) {  # true
    printf("x is non-zero\n");
}

if (p != nullptr) {  # false
    printf("p is not nullptr\n");
}
```

### Single-Statement Bodies

Braces are **required** even for single statements:

```bpl
local x: int = 1;

# CORRECT
if (x > 0) {
    x = x + 1;
}

# INCORRECT - will not compile
# if (x > 0)
#    x = x + 1;
```

This prevents common errors like the "dangling else" problem.

## Loop Statements

BPL provides several looping constructs. Note that BPL uses `loop` instead of `while` or `for`.

### Infinite Loop

```bpl
frame shouldStop() ret bool { return true; }

loop {
    # Loops forever until break
    if (shouldStop()) {
        break;
    }
}
```

### Condition-Based Loop

```bpl
local condition: bool = false;
loop (condition) {
    # Execute while condition is true
}
```

Example:

```bpl
local count: int = 0;
loop (count < 10) {
    printf("Count: %d\n", count);
    count++;
}
```

Example:

```bpl
local i: int = 0;
loop (i < 10) {
    printf("i = %d\n", i);
    i = i + 1;
}
```

**Parts:**

1. **Initialization:** Executed once before loop starts
2. **Condition:** Checked before each iteration
3. **Increment:** Executed after each iteration

### Loop Variables

Variables used in the loop condition must be declared before the loop:

```bpl
local i: int = 0;
loop (i < 5) {
    printf("%d\n", i);
    i = i + 1;
}

# i is accessible here
printf("Final: %d\n", i);
```

### Common Loop Patterns

**Counting up:**

```bpl
local n: int = 10;
local i: int = 0;
loop (i < n) {
    # Executes n times: i = 0, 1, 2, ..., n-1
    i = i + 1;
}
```

**Counting down:**

```bpl
local n: int = 10;
local i: int = n - 1;
loop (i >= 0) {
    # Executes n times: i = n-1, n-2, ..., 1, 0
    i = i - 1;
}
```

**Iterating array:**

```bpl
local arr: int[10];
local i: int = 0;
loop (i < 10) {
    arr[i] = i * i;
    i = i + 1;
}
```

**Iterating with pointer:**

```bpl
local arr: int[10];
local ptr: *int = &arr[0];
local end: *int = &arr[10];

loop (ptr < end) {
    *ptr = 0;
    ptr = &ptr[1];
}
```

**Processing until sentinel:**

```bpl
extern getchar() ret char;
frame processChar(c: char) { c; }

local ch: char = getchar();
loop (ch != '\n') {
    processChar(ch);
    ch = getchar();
}
```

### Nested Loops

```bpl
# Print multiplication table
local i: int = 1;
loop (i <= 10) {
    local j: int = 1;
    loop (j <= 10) {
        printf("%4d", i * j);
        j = j + 1;
    }
    printf("\n");
    i = i + 1;
}
```

## Switch Statements

Switch statements allow multi-way branching based on a value.

### Basic Switch

```bpl
local expression: int = 1;
# local const constant1: int = 1;
# local const constant2: int = 2;

switch (expression) {
    case 1: {
        # Execute if expression == 1
    }
    case 2: {
        # Execute if expression == 2
    }
    default: {
        # Execute if no case matches
    }
}
```

### Integer Switch

```bpl
local day: int = 3;

switch (day) {
    case 1: {
        printf("Monday\n");
    }
    case 2: {
        printf("Tuesday\n");
    }
    case 3: {
        printf("Wednesday\n");
    }
    case 4: {
        printf("Thursday\n");
    }
    case 5: {
        printf("Friday\n");
    }
    case 6: {
        printf("Saturday\n");
    }
    case 7: {
        printf("Sunday\n");
    }
    default: {
        printf("Invalid day\n");
    }
}
```

### Character Switch

```bpl
local op: char = '+';
local a: int = 10;
local b: int = 20;
local result: int = 0;

switch (op) {
    case '+': {
        result = a + b;
    }
    case '-': {
        result = a - b;
    }
    case '*': {
        result = a * b;
    }
    case '/': {
        result = a / b;
    }
    default: {
        printf("Unknown operator\n");
    }
}
```

### Default Case

The `default` case is optional but recommended:

```bpl
frame handleOne() {}
frame handleTwo() {}
frame handleUnexpected() {}

local value: int = 1;

# Without default - unmatched values do nothing
switch (value) {
    case 1: {
        handleOne();
    }
    case 2: {
        handleTwo();
    }
}

# With default - handles unexpected values
switch (value) {
    case 1: {
        handleOne();
    }
    case 2: {
        handleTwo();
    }
    default: {
        handleUnexpected();
    }
}
```

### Case Expressions

Case values must be compile-time constants:

```bpl
# local const OPTION_A: int = 1;
# local const OPTION_B: int = 2;
local option: int = 1;

switch (option) {
    case 1: { # OK: literal
    }
    case 2: { # OK: literal
    }
    # case x + 1: {    # ERROR: not a constant expression
    # }
}
```

## Match Expressions

BPL supports powerful pattern matching using the `match` expression. Unlike `switch`, `match` is an expression that returns a value, and it supports destructuring of Enums.

### Basic Match

```bpl
enum Status { Ok, Error(int) }

local s: Status = Status.Ok;

local msg: string = match(s) {
    Status.Ok => "Success",
    Status.Error(code) => "Failed with code",
};
```

### Match Arms with Blocks and Explicit Returns

Match arms can contain blocks of code. Inside these blocks, you can use the `return` statement to yield a value for the match expression. This is different from returning from the function.

```bpl
enum Status {
    Ok,
    Error(int)
}

local s: Status = Status.Ok;

local result: string = match(s) {
    Status.Ok => "All good",
    Status.Error(code) => {
        if (code == 404) {
            return "Not Found"; # Returns "Not Found" as the value of the match expression
        }
        if (code == 500) {
            return "Server Error";
        }
        return "Unknown Error";
    }
};
```

> **Note:** A `return` statement inside a match arm block returns a value to the `match` expression, NOT the enclosing function. To return from the function inside a match arm, you must use a control flow flag or structure your code differently.

### Nested Matches

You can nest match expressions. Explicit returns will yield to the nearest enclosing match expression.

```bpl
enum Inner {
    Val(int),
    Empty
}

enum Option<T> {
    Some(T),
    None
}

local opt: Option<Inner> = Option<Inner>.None;
local res: int = match(opt) {
    Option.None => 0,
    Option.Some(val) => {
        return match(val) {
            Inner.Val(v) => { return v + 1; },
            Inner.Empty => 0
        };
    }
};
```

## Break and Continue

### Break Statement

Exits the innermost loop or switch:

```bpl
local found: bool = false;
frame search(i: int) { i; }
frame process() {}
local value: int = 1;

# Exit loop early
local i: int = 0;
loop (i < 100) {
    if (found) {
        break;  # Exit loop
    }
    search(i);
    i = i + 1;
}

# Exit switch
switch (value) {
    case 1: {
        process();
        # break;  # Implicit in BPL
    }
}
```

**In nested loops, break only exits the innermost:**

```bpl
local shouldStop: bool = false;

local i: int = 0;
loop (i < 10) {
    local j: int = 0;
    loop (j < 10) {
        if (shouldStop) {
            break;  # Only exits inner loop
        }
        j = j + 1;
    }
    # Execution continues here after break
    i = i + 1;
}
```

**To break outer loop, use a flag:**

```bpl
local shouldStop: bool = false;

local done: bool = false;
local i: int = 0;
loop (i < 10 && !done) {
    local j: int = 0;
    loop (j < 10) {
        if (shouldStop) {
            done = true;
            break;
        }
        j = j + 1;
    }
    i = i + 1;
}
```

### Continue Statement

Skips to the next iteration of a loop:

```bpl
# Skip even numbers
local i: int = 0;
loop (i < 10) {
    if (i % 2 == 0) {
        i = i + 1;
        continue;  # Skip to next iteration
    }
    printf("%d is odd\n", i);
    i = i + 1;
}
```

**Continue behavior:**

- Skips remaining statements in loop body
- Executes increment (in for-style loops)
- Re-evaluates condition

```bpl
local i: int = 0;
loop (i < 10) {
    i = i + 1;
    if (i % 2 == 0) {
        continue;
    }
    printf("%d\n", i);  # Only prints odd numbers
}
```

### Break and Continue with Nested Loops

```bpl
local rows: int = 10;
local cols: int = 10;
local matrix: **int = nullptr; # Mock for compilation
frame process(val: int) { val; }

local i: int = 0;
loop (i < rows) {
    local j: int = 0;
    loop (j < cols) {
        if (matrix[i][j] == 0) {
            j = j + 1;
            continue;  # Skip this cell, continue inner loop
        }
        if (matrix[i][j] < 0) {
            break;  # Exit inner loop, continue outer loop
        }
        process(matrix[i][j]);
        j = j + 1;
    }
    i = i + 1;
}
```

## Return Statement

Exits a function and optionally returns a value.

### Return Without Value

```bpl
frame printMessage(msg: string) ret void {
    printf("%s\n", msg);
    return;  # Optional for void functions
}

frame processData(data: *int) ret void {
    if (data == nullptr) {
        return;  # Early exit
    }
    # Process data
}
```

### Return With Value

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

frame max(a: int, b: int) ret int {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}
```

### Multiple Return Statements

```bpl
frame classify(age: int) ret string {
    if (age < 13) {
        return "child";
    } else if (age < 20) {
        return "teenager";
    } else if (age < 60) {
        return "adult";
    } else {
        return "senior";
    }
}
```

### Early Returns

Use early returns to reduce nesting:

```bpl
frame validate(data: *int) ret bool { data; return true; }
frame transform(data: *int) ret bool { data; return true; }
frame save(data: *int) ret bool { data; return true; }

# Instead of:
frame process(data: *int) ret bool {
    if (data != nullptr) {
        if (validate(data)) {
            if (transform(data)) {
                return save(data);
            }
        }
    }
    return false;
}

# Better:
frame processBetter(data: *int) ret bool {
    if (data == nullptr) {
        return false;
    }
    if (!validate(data)) {
        return false;
    }
    if (!transform(data)) {
        return false;
    }
    return save(data);
}
```

### Returning Structs

```bpl
struct Point {
    x: int,
    y: int
}

frame createPoint(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;  # Returns a copy of the struct
}
```

## Control Flow Best Practices

1. **Prefer early returns** over deep nesting
2. **Use break and continue** instead of goto when possible
3. **Always include braces** even for single-statement bodies
4. **Use switch for multi-way branches** on a single value
5. **Add default cases** to switch statements
6. **Comment intentional fall-through** in switch statements
7. **Limit loop nesting depth** - extract inner loops to functions
8. **Use meaningful variable names** in loop counters (`i`, `j`, `k` are OK for simple loops)
9. **Avoid modifying loop counters** inside loop body
10. **Check loop bounds** to prevent infinite loops

## Common Patterns

### Search Loop

```bpl
local size: int = 10;
local array: int[10];
local target: int = 5;
local found: bool = false;
local index: int = -1;

local i: int = 0;
loop (i < size && !found) {
    if (array[i] == target) {
        found = true;
        index = i;
    }
    i = i + 1;
}
```

### Input Validation Loop

```bpl
extern scanf(fmt: string, ptr: *int);
local input: int;
loop (true) {
    printf("Enter a positive number: ");
    scanf("%d", &input);
    if (input > 0) {
        break;
    }
    printf("Invalid input. Try again.\n");
}
```

### Menu Loop

```bpl
frame add() {}
frame remove() {}
extern scanf(fmt: string, ptr: *int);

local choice: int;
loop (true) {
    printf("1. Add\n");
    printf("2. Remove\n");
    printf("3. Exit\n");
    scanf("%d", &choice);

    switch (choice) {
        case 1: {
            add();
        }
        case 2: {
            remove();
        }
        case 3: {
            return 0;
        }
        default: {
            printf("Invalid choice\n");
        }
    }
}
```

## Anonymous Blocks

BPL supports standalone blocks `{ ... }` as statements. These are useful for creating new scopes to limit variable lifetime or to shadow variables.

```bpl
frame main() ret int {
    local x: int = 10;

    # Anonymous block
    {
        local x: int = 20;  # Shadows outer x
        local y: int = 30;
        printf("Inner x: %d, y: %d\n", x, y);
    }

    # y is not accessible here
    printf("Outer x: %d\n", x);  # Prints 10

    return 0;
}
```

## Next Steps

- [Functions Basics](08-functions-basics.md) - Function declarations and calls
- [Functions Advanced](09-functions-advanced.md) - Overloading, recursion, pointers
- [Operators](06-operators.md) - Operator reference
