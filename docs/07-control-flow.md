# Control Flow

Control flow statements determine the execution order of code. BPL provides familiar control structures with some unique syntax choices.

## Table of Contents

- [If Statements](#if-statements)
- [Loop Statements](#loop-statements)
- [Switch Statements](#switch-statements)
- [Break and Continue](#break-and-continue)
- [Return Statement](#return-statement)
- [Goto and Labels](#goto-and-labels)

## If Statements

### Basic If

```bpl
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
if (condition) {
    # Execute if true
} else {
    # Execute if false
}
```

Example:

```bpl
if (temperature > 30) {
    printf("It's hot\n");
} else {
    printf("It's not hot\n");
}
```

### Else-If Chains

```bpl
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
if (x) {  # true
    printf("x is non-zero\n");
}

# Pointers: null is false, non-null is true
local p: int* = null;
if (p) {  # false
    printf("p is not null\n");
}

# Explicit comparison (preferred for clarity)
if (x != 0) {  # true
    printf("x is non-zero\n");
}

if (p != null) {  # false
    printf("p is not null\n");
}
```

### Single-Statement Bodies

Braces are **required** even for single statements:

```bpl
# CORRECT
if (x > 0) {
    x++;
}

# INCORRECT - will not compile
if (x > 0)
    x++;
```

This prevents common errors like the "dangling else" problem.

## Loop Statements

BPL provides several looping constructs. Note that BPL uses `loop` instead of `while` or `for`.

### Infinite Loop

```bpl
loop {
    # Loops forever until break
    if (shouldStop()) {
        break;
    }
}
```

### Condition-Based Loop

```bpl
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

### C-Style For Loop

```bpl
loop (initialization; condition; increment) {
    # Execute while condition is true
}
```

Example:

```bpl
loop (local i: int = 0; i < 10; i++) {
    printf("i = %d\n", i);
}
```

**Parts:**

1. **Initialization:** Executed once before loop starts
2. **Condition:** Checked before each iteration
3. **Increment:** Executed after each iteration

### Loop Variable Scope

Variables declared in loop initialization are scoped to the loop:

```bpl
loop (local i: int = 0; i < 5; i++) {
    printf("%d\n", i);
}

# ERROR: i is not accessible here
# printf("%d\n", i);
```

To access after loop, declare outside:

```bpl
local i: int = 0;
loop (i = 0; i < 5; i++) {
    printf("%d\n", i);
}
printf("Final: %d\n", i);  # OK: i is 5
```

### Common Loop Patterns

**Counting up:**

```bpl
loop (local i: int = 0; i < n; i++) {
    # Executes n times: i = 0, 1, 2, ..., n-1
}
```

**Counting down:**

```bpl
loop (local i: int = n - 1; i >= 0; i--) {
    # Executes n times: i = n-1, n-2, ..., 1, 0
}
```

**Iterating array:**

```bpl
local arr: int[10];
loop (local i: int = 0; i < 10; i++) {
    arr[i] = i * i;
}
```

**Iterating with pointer:**

```bpl
local arr: int[10];
local ptr: int* = &arr[0];
local end: int* = &arr[10];

loop (ptr < end) {
    *ptr = 0;
    ptr++;
}
```

**Processing until sentinel:**

```bpl
loop (local ch: char = getchar(); ch != '\n'; ch = getchar()) {
    processChar(ch);
}
```

### Nested Loops

```bpl
# Print multiplication table
loop (local i: int = 1; i <= 10; i++) {
    loop (local j: int = 1; j <= 10; j++) {
        printf("%4d", i * j);
    }
    printf("\n");
}
```

## Switch Statements

Switch statements allow multi-way branching based on a value.

### Basic Switch

```bpl
switch (expression) {
    case constant1:
        # Execute if expression == constant1
        break;
    case constant2:
        # Execute if expression == constant2
        break;
    default:
        # Execute if no case matches
        break;
}
```

### Integer Switch

```bpl
local day: int = 3;

switch (day) {
    case 1:
        printf("Monday\n");
        break;
    case 2:
        printf("Tuesday\n");
        break;
    case 3:
        printf("Wednesday\n");
        break;
    case 4:
        printf("Thursday\n");
        break;
    case 5:
        printf("Friday\n");
        break;
    case 6:
        printf("Saturday\n");
        break;
    case 7:
        printf("Sunday\n");
        break;
    default:
        printf("Invalid day\n");
        break;
}
```

### Character Switch

```bpl
local op: char = '+';

switch (op) {
    case '+':
        result = a + b;
        break;
    case '-':
        result = a - b;
        break;
    case '*':
        result = a * b;
        break;
    case '/':
        result = a / b;
        break;
    default:
        printf("Unknown operator\n");
        break;
}
```

### Fall-Through

Omitting `break` causes fall-through to the next case:

```bpl
switch (ch) {
    case 'a':
    case 'e':
    case 'i':
    case 'o':
    case 'u':
        printf("Vowel\n");
        break;
    case ' ':
    case '\t':
    case '\n':
        printf("Whitespace\n");
        break;
    default:
        printf("Consonant\n");
        break;
}
```

**Warning:** Fall-through is often unintentional and can cause bugs. Use comments to indicate intentional fall-through:

```bpl
switch (state) {
    case STATE_INIT:
        initialize();
        # Fall through to start processing
    case STATE_PROCESS:
        process();
        break;
    default:
        break;
}
```

### Default Case

The `default` case is optional but recommended:

```bpl
# Without default - unmatched values do nothing
switch (value) {
    case 1:
        handleOne();
        break;
    case 2:
        handleTwo();
        break;
}

# With default - handles unexpected values
switch (value) {
    case 1:
        handleOne();
        break;
    case 2:
        handleTwo();
        break;
    default:
        handleUnexpected();
        break;
}
```

### Case Expressions

Case values must be compile-time constants:

```bpl
const OPTION_A: int = 1;
const OPTION_B: int = 2;

switch (option) {
    case OPTION_A:  # OK: constant
        break;
    case OPTION_B:  # OK: constant
        break;
    case x + 1:     # ERROR: not a constant expression
        break;
}
```

## Break and Continue

### Break Statement

Exits the innermost loop or switch:

```bpl
# Exit loop early
loop (local i: int = 0; i < 100; i++) {
    if (found) {
        break;  # Exit loop
    }
    search(i);
}

# Exit switch
switch (value) {
    case 1:
        process();
        break;  # Exit switch
}
```

**In nested loops, break only exits the innermost:**

```bpl
loop (local i: int = 0; i < 10; i++) {
    loop (local j: int = 0; j < 10; j++) {
        if (shouldStop) {
            break;  # Only exits inner loop
        }
    }
    # Execution continues here after break
}
```

**To break outer loop, use a flag:**

```bpl
local done: bool = false;
loop (local i: int = 0; i < 10 && !done; i++) {
    loop (local j: int = 0; j < 10; j++) {
        if (shouldStop) {
            done = true;
            break;
        }
    }
}
```

### Continue Statement

Skips to the next iteration of a loop:

```bpl
# Skip even numbers
loop (local i: int = 0; i < 10; i++) {
    if (i % 2 == 0) {
        continue;  # Skip to next iteration
    }
    printf("%d is odd\n", i);
}
```

**Continue behavior:**

- Skips remaining statements in loop body
- Executes increment (in for-style loops)
- Re-evaluates condition

```bpl
local i: int = 0;
loop (i < 10) {
    i++;
    if (i % 2 == 0) {
        continue;
    }
    printf("%d\n", i);  # Only prints odd numbers
}
```

### Break and Continue with Nested Loops

```bpl
loop (local i: int = 0; i < rows; i++) {
    loop (local j: int = 0; j < cols; j++) {
        if (matrix[i][j] == 0) {
            continue;  # Skip this cell, continue inner loop
        }
        if (matrix[i][j] < 0) {
            break;  # Exit inner loop, continue outer loop
        }
        process(matrix[i][j]);
    }
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

frame processData(data: int*) ret void {
    if (data == null) {
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
# Instead of:
frame process(data: int*) ret bool {
    if (data != null) {
        if (validate(data)) {
            if (transform(data)) {
                return save(data);
            }
        }
    }
    return false;
}

# Better:
frame process(data: int*) ret bool {
    if (data == null) {
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
    x: int;
    y: int;
}

frame createPoint(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;  # Returns a copy of the struct
}
```

## Goto and Labels

BPL supports `goto` for low-level control flow, though it should be used sparingly.

### Basic Goto

```bpl
frame example() ret void {
    local i: int = 0;

start:
    printf("%d\n", i);
    i++;
    if (i < 10) {
        goto start;
    }
}
```

### Error Handling with Goto

A common legitimate use of goto is centralized cleanup:

```bpl
frame processFile(filename: string) ret bool {
    local file: File* = null;
    local buffer: char* = null;
    local result: bool = false;

    file = fopen(filename, "r");
    if (file == null) {
        goto cleanup;
    }

    buffer = cast<char*>(malloc(1024));
    if (buffer == null) {
        goto cleanup;
    }

    if (!readData(file, buffer)) {
        goto cleanup;
    }

    result = processData(buffer);

cleanup:
    if (buffer != null) {
        free(buffer);
    }
    if (file != null) {
        fclose(file);
    }
    return result;
}
```

### Breaking Out of Nested Loops

```bpl
loop (local i: int = 0; i < 100; i++) {
    loop (local j: int = 0; j < 100; j++) {
        if (found(i, j)) {
            goto done;
        }
    }
}
done:
printf("Search complete\n");
```

### Goto Restrictions

- Cannot jump into a block from outside
- Cannot jump over variable declarations (in some cases)
- Label must be in the same function

```bpl
# ERROR: Cannot jump into block
if (condition) {
    label:
        doSomething();
}
goto label;  # ERROR
```

**Best Practices:**

- Use goto sparingly - prefer structured control flow
- Use goto mainly for error handling and cleanup
- Label names should be descriptive: `cleanup`, `error`, `done`
- Don't use goto to create spaghetti code

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
local found: bool = false;
local index: int = -1;

loop (local i: int = 0; i < size && !found; i++) {
    if (array[i] == target) {
        found = true;
        index = i;
    }
}
```

### Input Validation Loop

```bpl
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
local choice: int;
loop (true) {
    printf("1. Add\n");
    printf("2. Remove\n");
    printf("3. Exit\n");
    scanf("%d", &choice);

    switch (choice) {
        case 1:
            add();
            break;
        case 2:
            remove();
            break;
        case 3:
            return;
        default:
            printf("Invalid choice\n");
            break;
    }
}
```

## Next Steps

- [Functions Basics](08-functions-basics.md) - Function declarations and calls
- [Functions Advanced](09-functions-advanced.md) - Overloading, recursion, pointers
- [Operators](06-operators.md) - Operator reference
