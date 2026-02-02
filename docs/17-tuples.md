# Tuples

Tuples allow you to group multiple values of potentially different types into a single compound value. They are useful for returning multiple values from functions, temporary groupings, and pattern matching.

## Table of Contents

- [Tuple Basics](#tuple-basics)
- [Creating Tuples](#creating-tuples)
- [Destructuring](#destructuring)
- [Tuples in Functions](#tuples-in-functions)
- [Pattern Matching with Tuples](#pattern-matching-with-tuples)
- [Nested Tuples](#nested-tuples)
- [Tuples vs Structs](#tuples-vs-structs)
- [Common Patterns](#common-patterns)
- [Best Practices](#best-practices)

## Tuple Basics

A tuple is an ordered, fixed-size collection of values where each element can have a different type.

### Type Syntax

```bpl
# Tuple type syntax: (Type1, Type2, ...)
local pair: (int, int);           # Pair of integers
local mixed: (string, int);       # String and integer
local triple: (int, float, bool); # Three different types
```

### Key Characteristics

- **Fixed size**: The number of elements is determined at compile time
- **Heterogeneous**: Elements can have different types
- **Ordered**: Elements are accessed by position
- **Value type**: Tuples are copied when assigned

## Creating Tuples

### Tuple Literals

Create tuples using parentheses with comma-separated values:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Simple tuples
    local point: (int, int) = (10, 20);
    local person: (string, int) = ("Alice", 30);
    local data: (int, float, bool) = (42, 3.14, true);

    # Single-element tuples need a trailing comma
    local single: (int,) = (42,);

    # Empty tuple (unit type)
    local unit: () = ();

    return 0;
}
```

### Creating Tuples from Expressions

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 5;
    local y: int = 10;

    # Create tuple from variables
    local point: (int, int) = (x, y);

    # Create tuple from expressions
    local computed: (int, int) = (x + y, x * y);

    # Nested function calls
    local result: (int, int) = (abs(-5), max(3, 7));

    return 0;
}

frame abs(n: int) ret int {
    if (n < 0) { return -n; }
    return n;
}

frame max(a: int, b: int) ret int {
    if (a > b) { return a; }
    return b;
}
```

## Destructuring

Destructuring allows you to extract tuple elements into separate variables:

### Basic Destructuring

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local point: (int, int) = (10, 20);

    # Destructure into variables
    local (x, y) = point;

    printf("x = %d, y = %d\n", x, y);

    # Destructure with type annotations
    local (a: int, b: int) = (100, 200);
    printf("a = %d, b = %d\n", a, b);

    return 0;
}
```

### Ignoring Elements

Use `_` to ignore elements you don't need:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local data: (int, string, float) = (42, "hello", 3.14);

    # Only extract the string
    local (_, name, _) = data;
    printf("Name: %s\n", name);

    # Only extract first and last
    local (first, _, last) = data;
    printf("First: %d, Last: %f\n", first, last);

    return 0;
}
```

### Nested Destructuring

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local nested: ((int, int), string) = ((10, 20), "point");

    # Nested destructuring
    local ((x, y), label) = nested;
    printf("%s: (%d, %d)\n", label, x, y);

    return 0;
}
```

## Tuples in Functions

### Returning Multiple Values

Tuples are commonly used to return multiple values from a function:

```bpl
extern printf(fmt: string, ...);

# Return both quotient and remainder
frame divMod(a: int, b: int) ret (int, int) {
    local quotient: int = a / b;
    local remainder: int = a % b;
    return (quotient, remainder);
}

# Return success status and value
frame safeDivide(a: int, b: int) ret (bool, int) {
    if (b == 0) {
        return (false, 0);
    }
    return (true, a / b);
}

# Return min and max of an array
frame minMax(arr: *int, len: int) ret (int, int) {
    local min: int = arr[0];
    local max: int = arr[0];

    loop (local i: int = 1; i < len; i = i + 1) {
        if (arr[i] < min) { min = arr[i]; }
        if (arr[i] > max) { max = arr[i]; }
    }

    return (min, max);
}

frame main() ret int {
    # Using divMod
    local (q, r) = divMod(17, 5);
    printf("17 / 5 = %d remainder %d\n", q, r);

    # Using safeDivide
    local (success, result) = safeDivide(10, 0);
    if (success) {
        printf("Result: %d\n", result);
    } else {
        printf("Division by zero!\n");
    }

    # Using minMax
    local arr: int[5] = [3, 1, 4, 1, 5];
    local (min, max) = minMax(&arr[0], 5);
    printf("Min: %d, Max: %d\n", min, max);

    return 0;
}
```

### Tuple Parameters

Functions can accept tuples as parameters:

```bpl
extern printf(fmt: string, ...);

frame printPoint(p: (int, int)) ret void {
    local (x, y) = p;
    printf("(%d, %d)\n", x, y);
}

frame addPoints(p1: (int, int), p2: (int, int)) ret (int, int) {
    local (x1, y1) = p1;
    local (x2, y2) = p2;
    return (x1 + x2, y1 + y2);
}

frame main() ret int {
    local p1: (int, int) = (10, 20);
    local p2: (int, int) = (5, 15);

    printPoint(p1);
    printPoint(p2);

    local sum: (int, int) = addPoints(p1, p2);
    printf("Sum: ");
    printPoint(sum);

    return 0;
}
```

## Pattern Matching with Tuples

Tuples work seamlessly with `match` expressions:

```bpl
extern printf(fmt: string, ...);

frame describePoint(p: (int, int)) ret void {
    match (p) {
        (0, 0) => printf("Origin\n"),
        (0, y) => printf("On Y-axis at y=%d\n", y),
        (x, 0) => printf("On X-axis at x=%d\n", x),
        (x, y) if x == y => printf("On diagonal at (%d, %d)\n", x, y),
        (x, y) if x > 0 && y > 0 => printf("Quadrant I: (%d, %d)\n", x, y),
        (x, y) if x < 0 && y > 0 => printf("Quadrant II: (%d, %d)\n", x, y),
        (x, y) if x < 0 && y < 0 => printf("Quadrant III: (%d, %d)\n", x, y),
        (x, y) => printf("Quadrant IV: (%d, %d)\n", x, y),
    };
}

frame main() ret int {
    describePoint((0, 0));
    describePoint((0, 5));
    describePoint((3, 0));
    describePoint((4, 4));
    describePoint((3, 5));
    describePoint((-2, 3));

    return 0;
}
```

### Match with Guards

```bpl
extern printf(fmt: string, ...);

frame classifyTriangle(sides: (int, int, int)) ret string {
    local (a, b, c) = sides;

    # Sort sides (simple bubble sort for 3 elements)
    if (a > b) { local t: int = a; a = b; b = t; }
    if (b > c) { local t: int = b; b = c; c = t; }
    if (a > b) { local t: int = a; a = b; b = t; }

    # Check validity
    if (a + b <= c) {
        return "Invalid";
    }

    # Classify
    if (a == b && b == c) {
        return "Equilateral";
    }
    if (a == b || b == c) {
        return "Isosceles";
    }
    return "Scalene";
}

frame main() ret int {
    printf("(3,3,3): %s\n", classifyTriangle((3, 3, 3)));
    printf("(3,3,5): %s\n", classifyTriangle((3, 3, 5)));
    printf("(3,4,5): %s\n", classifyTriangle((3, 4, 5)));
    printf("(1,1,10): %s\n", classifyTriangle((1, 1, 10)));

    return 0;
}
```

## Nested Tuples

Tuples can contain other tuples:

```bpl
extern printf(fmt: string, ...);

# Line segment defined by two points
type Point = (int, int);
type Line = (Point, Point);

# Rectangle defined by top-left and bottom-right corners
type Rect = ((int, int), (int, int));

frame lineLength(line: Line) ret float {
    local ((x1, y1), (x2, y2)) = line;
    local dx: int = x2 - x1;
    local dy: int = y2 - y1;
    return sqrt(cast<float>(dx * dx + dy * dy));
}

frame rectArea(rect: Rect) ret int {
    local ((x1, y1), (x2, y2)) = rect;
    local width: int = x2 - x1;
    local height: int = y2 - y1;
    if (width < 0) { width = -width; }
    if (height < 0) { height = -height; }
    return width * height;
}

extern sqrt(x: float) ret float;

frame main() ret int {
    local line: Line = ((0, 0), (3, 4));
    printf("Line length: %f\n", lineLength(line));

    local rect: Rect = ((0, 0), (10, 5));
    printf("Rectangle area: %d\n", rectArea(rect));

    return 0;
}
```

## Tuples vs Structs

| Feature          | Tuples  | Structs |
| ---------------- | ------- | ------- |
| Named fields     | No      | Yes     |
| Methods          | No      | Yes     |
| Destructuring    | Yes     | Limited |
| Quick grouping   | Ideal   | Verbose |
| Self-documenting | No      | Yes     |
| Reusability      | Limited | High    |

### When to Use Tuples

```bpl
# Good: Quick return of multiple values
frame divMod(a: int, b: int) ret (int, int) {
    return (a / b, a % b);
}

# Good: Temporary grouping
local coords: (int, int) = (x, y);
```

### When to Use Structs

```bpl
# Better: Named fields for clarity
struct DivResult {
    quotient: int,
    remainder: int,
}

# Better: When you need methods
struct Point {
    x: int,
    y: int,

    frame distance(this: *Point) ret float { ... }
}
```

## Common Patterns

### Swap Values

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 10;
    local b: int = 20;

    printf("Before: a=%d, b=%d\n", a, b);

    # Swap using tuple destructuring
    local (newA, newB) = (b, a);
    a = newA;
    b = newB;

    printf("After: a=%d, b=%d\n", a, b);

    return 0;
}
```

### Coordinate Systems

```bpl
extern printf(fmt: string, ...);
extern sqrt(x: float) ret float;
extern sin(x: float) ret float;
extern cos(x: float) ret float;
extern atan2(y: float, x: float) ret float;

type Cartesian = (float, float);
type Polar = (float, float);  # (radius, angle)

frame toPolar(cart: Cartesian) ret Polar {
    local (x, y) = cart;
    local r: float = sqrt(x * x + y * y);
    local theta: float = atan2(y, x);
    return (r, theta);
}

frame toCartesian(polar: Polar) ret Cartesian {
    local (r, theta) = polar;
    return (r * cos(theta), r * sin(theta));
}

frame main() ret int {
    local cart: Cartesian = (3.0, 4.0);
    local polar: Polar = toPolar(cart);

    local (r, theta) = polar;
    printf("Polar: r=%f, theta=%f\n", r, theta);

    return 0;
}
```

### Error Handling Pattern

```bpl
extern printf(fmt: string, ...);

# Result type using tuple: (success, value, error_message)
frame parseInt(s: string) ret (bool, int, string) {
    # Simplified implementation
    if (s == "") {
        return (false, 0, "Empty string");
    }
    # ... actual parsing logic ...
    return (true, 42, "");
}

frame main() ret int {
    local (ok, value, err) = parseInt("42");

    if (ok) {
        printf("Parsed: %d\n", value);
    } else {
        printf("Error: %s\n", err);
    }

    return 0;
}
```

## Best Practices

### 1. Use Type Aliases for Complex Tuples

```bpl
# Good: Clear and reusable
type Point = (int, int);
type Bounds = (Point, Point);

frame getBounds() ret Bounds {
    return ((0, 0), (100, 100));
}

# Avoid: Hard to understand
frame getBounds2() ret ((int, int), (int, int)) {
    return ((0, 0), (100, 100));
}
```

### 2. Prefer Structs for Public APIs

```bpl
# For internal/temporary use: tuples are fine
local temp: (int, int) = (x, y);

# For public APIs: use structs for clarity
struct Point {
    x: int,
    y: int,
}
```

### 3. Destructure Immediately When Possible

```bpl
# Good: Immediate destructuring
local (x, y) = getPoint();
printf("Point: (%d, %d)\n", x, y);

# Less clear: Accessing without destructuring
local p: (int, int) = getPoint();
# ... later usage requires remembering order
```

### 4. Keep Tuples Small

```bpl
# Good: 2-3 elements
local pair: (int, int) = (1, 2);
local triple: (int, string, bool) = (1, "a", true);

# Consider struct instead: Too many elements
# local large: (int, int, string, float, bool, char) = ...;
struct Data {
    id: int,
    count: int,
    name: string,
    value: float,
    active: bool,
    type: char,
}
```

---

**Next:** Learn about [Type Aliases](18-type-aliases.md) to create readable names for complex types.
