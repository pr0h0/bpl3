# Operators

This guide covers all operators available in BPL, their precedence, associativity, and usage patterns.

## Table of Contents

- [Operator Precedence](#operator-precedence)
- [Arithmetic Operators](#arithmetic-operators)
- [Comparison Operators](#comparison-operators)
- [Logical Operators](#logical-operators)
- [Bitwise Operators](#bitwise-operators)
- [Assignment Operators](#assignment-operators)
- [Compound Assignment](#compound-assignment)
- [Pointer Operators](#pointer-operators)
- [Cast Operator](#cast-operator)
- [Ternary Operator](#ternary-operator)
- [Member Access](#member-access)
- [Subscript Operator](#subscript-operator)
- [Sizeof Operator](#sizeof-operator)

## Operator Precedence

BPL operators follow C-like precedence rules. Higher precedence operators bind more tightly.

| Precedence  | Operators                                            | Description                           | Associativity |
| ----------- | ---------------------------------------------------- | ------------------------------------- | ------------- | ------------- | ------------- |
| 1 (highest) | `()` `[]` `.` `->`                                   | Parentheses, subscript, member access | Left to right |
| 2           | `!` `~` `++` `--` `+` `-` `*` `&` `cast` `sizeof`    | Unary operators                       | Right to left |
| 3           | `*` `/` `%`                                          | Multiplicative                        | Left to right |
| 4           | `+` `-`                                              | Additive                              | Left to right |
| 5           | `<<` `>>`                                            | Bitwise shift                         | Left to right |
| 6           | `<` `<=` `>` `>=`                                    | Relational                            | Left to right |
| 7           | `==` `!=`                                            | Equality                              | Left to right |
| 8           | `&`                                                  | Bitwise AND                           | Left to right |
| 9           | `^`                                                  | Bitwise XOR                           | Left to right |
| 10          | `                                                    | `                                     | Bitwise OR    | Left to right |
| 11          | `&&`                                                 | Logical AND                           | Left to right |
| 12          | `                                                    |                                       | `             | Logical OR    | Left to right |
| 13          | `?:`                                                 | Ternary conditional                   | Right to left |
| 14 (lowest) | `=` `+=` `-=` `*=` `/=` `%=` `<<=` `>>=` `&=` `^=` ` | =`                                    | Assignment    | Right to left |

## Arithmetic Operators

### Binary Arithmetic

```bpl
local a: int = 10;
local b: int = 3;

local sum: int = a + b;        # 13
local diff: int = a - b;       # 7
local product: int = a * b;    # 30
local quotient: int = a / b;   # 3 (integer division)
local remainder: int = a % b;  # 1 (modulo)
```

**Supported Types:**

- Integers: `i8`, `i16`, `i32`, `i64`, `int`, `long`
- Floating-point: `f32`, `f64`, `float`, `double`
- Character: `char` (treated as integer)

**Important Notes:**

- Integer division truncates toward zero
- Division by zero is undefined behavior
- Modulo requires integer operands
- Float modulo uses `fmod` semantics

### Unary Arithmetic

```bpl
local x: int = 5;
local y: int = -x;  # Negation: -5
local z: int = +x;  # Unary plus (identity): 5

# Increment/Decrement
local count: int = 0;
count++;  # Post-increment: count = 1
++count;  # Pre-increment: count = 2
count--;  # Post-decrement: count = 1
--count;  # Pre-decrement: count = 0
```

**Behavior:**

- `++x`: Increment then return new value
- `x++`: Return current value then increment
- `--x`: Decrement then return new value
- `x--`: Return current value then decrement

### Type Promotion

Mixed-type arithmetic promotes to the "larger" type:

```bpl
local i: int = 10;
local f: float = 3.5;
local result: float = i + f;  # int promoted to float: 13.5
```

**Promotion Rules:**

1. If either operand is `double`, both become `double`
2. If either operand is `float`, both become `float`
3. If either operand is `long`, both become `long`
4. Otherwise, both are `int`

## Comparison Operators

```bpl
local a: int = 10;
local b: int = 20;

local eq: bool = (a == b);   # Equal: false
local neq: bool = (a != b);  # Not equal: true
local lt: bool = (a < b);    # Less than: true
local le: bool = (a <= b);   # Less or equal: true
local gt: bool = (a > b);    # Greater than: false
local ge: bool = (a >= b);   # Greater or equal: false
```

**Result Type:** Always `bool` (0 or 1)

**Pointer Comparison:**

```bpl
local p1: int* = &a;
local p2: int* = &b;
local same: bool = (p1 == p2);  # Pointer equality
```

**String Comparison:**

```bpl
# Strings compare by pointer address, not content!
# Use standard library functions for content comparison
local s1: string = "hello";
local s2: string = "hello";
local same: bool = (s1 == s2);  # May be false even if content matches
```

## Logical Operators

### Boolean Operations

```bpl
local a: bool = true;
local b: bool = false;

local and_result: bool = a && b;  # Logical AND: false
local or_result: bool = a || b;   # Logical OR: true
local not_result: bool = !a;      # Logical NOT: false
```

**Short-Circuit Evaluation:**

```bpl
# b is only evaluated if a is true
if (a && b) {
    # ...
}

# b is only evaluated if a is false
if (a || b) {
    # ...
}
```

Example:

```bpl
frame safeDivide(a: int, b: int) ret bool {
    # b != 0 is only checked if b != 0, preventing division by zero
    return (b != 0) && (a / b > 0);
}
```

### Truthiness

Non-boolean values in logical contexts:

- **Numbers:** 0 is false, non-zero is true
- **Pointers:** `null` is false, non-null is true

```bpl
local x: int = 5;
if (x) {  # Equivalent to: if (x != 0)
    printf("x is non-zero\n");
}

local p: int* = null;
if (!p) {  # Equivalent to: if (p == null)
    printf("p is null\n");
}
```

## Bitwise Operators

### Binary Bitwise

```bpl
local a: int = 0b1100;  # 12
local b: int = 0b1010;  # 10

local and_bits: int = a & b;   # Bitwise AND: 0b1000 (8)
local or_bits: int = a | b;    # Bitwise OR:  0b1110 (14)
local xor_bits: int = a ^ b;   # Bitwise XOR: 0b0110 (6)
local not_bits: int = ~a;      # Bitwise NOT: 0b...0011 (-13 in two's complement)
```

### Shift Operators

```bpl
local x: int = 5;  # 0b101

local left: int = x << 2;   # Left shift:  0b10100 (20)
local right: int = x >> 1;  # Right shift: 0b10 (2)
```

**Important:**

- Left shift multiplies by powers of 2: `x << n` ≈ `x * 2^n`
- Right shift divides by powers of 2: `x >> n` ≈ `x / 2^n`
- Shifting negative numbers is implementation-defined
- Shifting by negative or >= bit-width is undefined

### Common Bit Manipulation

```bpl
# Set bit n
x |= (1 << n);

# Clear bit n
x &= ~(1 << n);

# Toggle bit n
x ^= (1 << n);

# Check if bit n is set
if (x & (1 << n)) {
    # Bit is set
}

# Extract low byte
local low_byte: int = x & 0xFF;

# Swap using XOR
a ^= b;
b ^= a;
a ^= b;
```

## Assignment Operators

### Simple Assignment

```bpl
local x: int;
x = 10;  # Assign value

local y: int = x;  # Copy value
```

**Assignment is an expression:**

```bpl
local a: int;
local b: int;
local c: int;

# Chain assignments (right-to-left)
a = b = c = 5;  # All become 5

# Assignment in condition
if ((x = getValue()) != 0) {
    # x was assigned and checked
}
```

## Compound Assignment

Compound operators combine operation and assignment:

```bpl
local x: int = 10;

x += 5;   # x = x + 5;   -> 15
x -= 3;   # x = x - 3;   -> 12
x *= 2;   # x = x * 2;   -> 24
x /= 4;   # x = x / 4;   -> 6
x %= 5;   # x = x % 5;   -> 1

x <<= 2;  # x = x << 2;  -> 4
x >>= 1;  # x = x >> 1;  -> 2

x &= 0xF;  # x = x & 0xF;
x |= 0x10; # x = x | 0x10;
x ^= 0xFF; # x = x ^ 0xFF;
```

**Available Compound Operators:**

- Arithmetic: `+=`, `-=`, `*=`, `/=`, `%=`
- Bitwise: `<<=`, `>>=`, `&=`, `|=`, `^=`

**Equivalent but more efficient:**

```bpl
# Instead of:
array[complexIndex()] = array[complexIndex()] + 1;

# Use:
array[complexIndex()] += 1;  # Index calculated only once
```

## Pointer Operators

### Address-Of Operator (&)

```bpl
local x: int = 42;
local p: int* = &x;  # Get address of x
```

### Dereference Operator (\*)

```bpl
local value: int = *p;  # Read value at address
*p = 100;               # Write value to address
```

### Pointer Arithmetic

```bpl
local arr: int[5] = [1, 2, 3, 4, 5];
local p: int* = &arr[0];

p++;        # Points to arr[1]
p += 2;     # Points to arr[3]
p--;        # Points to arr[2]

local value: int = *(p + 1);  # Read arr[3]
```

**Scaling:**

- Pointer arithmetic automatically scales by the pointed-to type size
- `p + 1` adds `sizeof(int)` bytes, not 1 byte

### Null Checks

```bpl
if (p != null) {
    local value: int = *p;  # Safe to dereference
}
```

## Cast Operator

```bpl
# Syntax: cast<TargetType>(expression)

local i: int = 42;
local f: float = cast<float>(i);      # Integer to float
local c: char = cast<char>(65);       # Integer to char ('A')

local p: void* = malloc(100);
local ip: int* = cast<int*>(p);       # Pointer cast

# Narrowing casts (may lose precision)
local large: long = 1000000;
local small: int = cast<int>(large);  # Truncation possible
```

**Cast Types:**

1. **Numeric casts:** Between integer and floating-point types
2. **Pointer casts:** Between pointer types
3. **Reinterpret casts:** Treat bits as different type

**Warning:** Unsafe casts can cause undefined behavior. Use with caution.

## Ternary Operator

```bpl
# Syntax: condition ? value_if_true : value_if_false

local max: int = (a > b) ? a : b;

local sign: string = (x >= 0) ? "positive" : "negative";

# Nested ternary
local category: string = (score >= 90) ? "A" :
                         (score >= 80) ? "B" :
                         (score >= 70) ? "C" : "F";
```

**Evaluation:**

- Condition is evaluated first
- Only one branch is evaluated (short-circuit)
- Both branches must have compatible types

## Member Access

### Dot Operator (.)

```bpl
struct Point {
    x: int;
    y: int;
}

local p: Point;
p.x = 10;
p.y = 20;
local sum: int = p.x + p.y;
```

### Arrow Operator (->)

```bpl
local p_ptr: Point* = &p;
p_ptr->x = 30;  # Equivalent to: (*p_ptr).x = 30;
p_ptr->y = 40;
```

## Subscript Operator

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];

local first: int = arr[0];   # 10
local last: int = arr[4];    # 50

arr[2] = 35;  # Modify element

# Multi-dimensional arrays
local matrix: int[3][3];
matrix[1][2] = 5;
```

**Pointer subscripting:**

```bpl
local p: int* = &arr[0];
local third: int = p[2];  # Equivalent to: *(p + 2)
```

## Sizeof Operator

```bpl
# Syntax: sizeof(type) or sizeof(expression)

local int_size: int = sizeof(int);      # 4 (typically)
local ptr_size: int = sizeof(void*);    # 8 on 64-bit, 4 on 32-bit

struct Data {
    a: int;
    b: float;
    c: char;
}

local struct_size: int = sizeof(Data);

# Array size
local arr: int[10];
local arr_size: int = sizeof(arr);           # 40 (10 * 4)
local elem_count: int = sizeof(arr) / sizeof(int);  # 10
```

**Important:**

- `sizeof` is evaluated at compile-time
- Returns size in bytes
- For arrays, returns total size, not element count

## Operator Overloading

BPL does **not** support operator overloading. Custom types cannot redefine operators.

To provide operator-like functionality for custom types, use named methods:

```bpl
struct Vector {
    x: float;
    y: float;

    frame add(other: Vector*) ret Vector {
        local result: Vector;
        result.x = this.x + other->x;
        result.y = this.y + other->y;
        return result;
    }
}

local v1: Vector;
local v2: Vector;
local sum: Vector = v1.add(&v2);  # Not: v1 + v2
```

## Common Patterns

### Safe Pointer Dereferencing

```bpl
if (ptr != null && *ptr > 0) {
    # Safe: null check prevents dereference
}
```

### Conditional Assignment

```bpl
# Reset to default if negative
x = (x < 0) ? 0 : x;

# Clamp to range
x = (x < min) ? min : (x > max) ? max : x;
```

### Bit Flags

```bpl
const FLAG_READ: int = 0x01;
const FLAG_WRITE: int = 0x02;
const FLAG_EXECUTE: int = 0x04;

local permissions: int = FLAG_READ | FLAG_WRITE;

# Check flag
if (permissions & FLAG_WRITE) {
    # Has write permission
}

# Set flag
permissions |= FLAG_EXECUTE;

# Clear flag
permissions &= ~FLAG_READ;

# Toggle flag
permissions ^= FLAG_WRITE;
```

### Loop Increment

```bpl
# Post-increment in loop
for (local i: int = 0; i < 10; i++) {
    # i is used, then incremented
}

# Pre-increment
for (local i: int = 0; i < 10; ++i) {
    # i is incremented, then used (more efficient in theory)
}
```

## Best Practices

1. **Use parentheses** for clarity, even when not required by precedence
2. **Avoid deep ternary nesting** - use if/else for complex conditions
3. **Check pointers before dereferencing** to prevent crashes
4. **Be explicit with casts** - don't rely on implicit conversion
5. **Use compound assignment** for efficiency and clarity
6. **Prefer pre-increment** (++i) over post-increment (i++) when value isn't used
7. **Use sizeof** instead of hard-coding type sizes
8. **Watch for integer overflow** in arithmetic operations
9. **Be careful with operator precedence** - `a & b == c` is `a & (b == c)`, not `(a & b) == c`

## Next Steps

- [Control Flow](07-control-flow.md) - if, loop, switch statements
- [Functions](08-functions-basics.md) - Function declarations and calls
- [Pointers](15-pointers.md) - Deep dive into pointer operations
