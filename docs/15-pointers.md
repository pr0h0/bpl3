# Pointers

Pointers are variables that store memory addresses. They are essential for dynamic memory, data structures, and efficient parameter passing. This guide covers everything you need to know about pointers in BPL.

## Table of Contents

- [Pointer Basics](#pointer-basics)
- [Pointer Operations](#pointer-operations)
- [Pointer Arithmetic](#pointer-arithmetic)
- [Pointers and Arrays](#pointers-and-arrays)
- [Pointers to Structs](#pointers-to-structs)
- [Function Pointers](#function-pointers)
- [Double Pointers](#double-pointers)
- [Null Pointers](#null-pointers)
- [Common Pointer Patterns](#common-pointer-patterns)
- [Pointer Safety](#pointer-safety)

## Pointer Basics

### What is a Pointer?

A pointer is a variable that stores the memory address of another variable.

```bpl
local x: int = 42;
local p: int* = &x;  # p stores the address of x
```

**Diagram:**

```
Memory:
Address  | Variable | Value
---------|----------|-------
0x1000   | x        | 42
0x2000   | p        | 0x1000 (address of x)
```

### Pointer Declaration

```bpl
# Syntax: type*
local int_ptr: int*;
local float_ptr: float*;
local char_ptr: char*;
local str_ptr: string*;

# Multiple pointers
local p1: int*;
local p2: int*;

# Pointer to pointer
local pp: int**;
```

### Address-Of Operator (&)

Get the address of a variable:

```bpl
local x: int = 10;
local p: int* = &x;  # p now points to x

printf("Address of x: %p\n", p);
printf("Value of x: %d\n", x);
```

### Dereference Operator (\*)

Access the value at the address:

```bpl
local x: int = 10;
local p: int* = &x;

local value: int = *p;  # Read value: 10
*p = 20;                # Write value: x is now 20

printf("x = %d\n", x);  # Prints 20
```

### Complete Example

```bpl
frame main() ret int {
    local x: int = 42;
    local p: int* = &x;

    printf("x = %d\n", x);           # 42
    printf("&x = %p\n", &x);         # Address of x
    printf("p = %p\n", p);           # Same as &x
    printf("*p = %d\n", *p);         # 42

    *p = 100;  # Modify x through pointer
    printf("x = %d\n", x);           # 100

    return 0;
}
```

## Pointer Operations

### Assignment

```bpl
local x: int = 10;
local y: int = 20;

local p: int* = &x;  # p points to x
p = &y;              # Now p points to y

*p = 30;             # y is now 30
```

### Copying Pointers

```bpl
local x: int = 42;
local p1: int* = &x;
local p2: int* = p1;  # p2 now also points to x

*p1 = 100;  # x is 100
*p2 = 200;  # x is now 200
```

### Comparison

```bpl
local x: int = 10;
local y: int = 20;

local p1: int* = &x;
local p2: int* = &x;
local p3: int* = &y;

if (p1 == p2) {  # true - same address
    printf("p1 and p2 point to same location\n");
}

if (p1 != p3) {  # true - different addresses
    printf("p1 and p3 point to different locations\n");
}
```

### Null Comparison

```bpl
local p: int* = null;

if (p == null) {
    printf("p is null\n");
}

if (p != null) {
    # Safe to dereference
    printf("Value: %d\n", *p);
}
```

## Pointer Arithmetic

Pointers can be incremented, decremented, and used in arithmetic operations:

### Increment/Decrement

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];
local p: int* = &arr[0];

printf("%d\n", *p);  # 10

p++;                 # Move to next int
printf("%d\n", *p);  # 20

p--;                 # Move back
printf("%d\n", *p);  # 10
```

### Addition/Subtraction

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];
local p: int* = &arr[0];

printf("%d\n", *(p + 0));  # 10
printf("%d\n", *(p + 1));  # 20
printf("%d\n", *(p + 2));  # 30

local q: int* = p + 3;
printf("%d\n", *q);  # 40
```

### Pointer Difference

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];
local p1: int* = &arr[0];
local p2: int* = &arr[4];

local diff: int = p2 - p1;  # 4 (elements between them)
```

### Scaling

Pointer arithmetic automatically scales by the size of the pointed-to type:

```bpl
local arr: int[3];
local p: int* = &arr[0];

p++;  # Adds sizeof(int) bytes (typically 4)

local chars: char[10];
local cp: char* = &chars[0];

cp++;  # Adds sizeof(char) bytes (1)
```

## Pointers and Arrays

Arrays and pointers are closely related in BPL.

### Array Name as Pointer

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];

# arr can be used as a pointer to the first element
local p: int* = arr;  # Same as: = &arr[0]

printf("%d\n", *p);      # 10
printf("%d\n", *(p+1));  # 20
```

### Subscript Operator

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];
local p: int* = arr;

# These are equivalent:
printf("%d\n", arr[2]);   # 30
printf("%d\n", p[2]);     # 30
printf("%d\n", *(p + 2)); # 30
printf("%d\n", *(arr + 2));  # 30
```

### Iterating with Pointers

```bpl
local arr: int[5] = [10, 20, 30, 40, 50];

# Using index
loop (local i: int = 0; i < 5; i++) {
    printf("%d\n", arr[i]);
}

# Using pointer
local p: int* = arr;
local end: int* = arr + 5;
loop (p < end) {
    printf("%d\n", *p);
    p++;
}
```

### Passing Arrays to Functions

Arrays decay to pointers when passed to functions:

```bpl
frame printArray(arr: int*, size: int) ret void {
    loop (local i: int = 0; i < size; i++) {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

frame sumArray(arr: int*, size: int) ret int {
    local sum: int = 0;
    loop (local i: int = 0; i < size; i++) {
        sum += arr[i];
    }
    return sum;
}

# Usage
local numbers: int[5] = [1, 2, 3, 4, 5];
printArray(numbers, 5);
local total: int = sumArray(numbers, 5);
```

## Pointers to Structs

### Arrow Operator

```bpl
struct Point {
    x: int;
    y: int;
}

local p: Point;
p.x = 10;
p.y = 20;

local ptr: Point* = &p;

# Arrow operator for pointer-to-struct
ptr->x = 30;
ptr->y = 40;

# Equivalent to:
(*ptr).x = 30;
(*ptr).y = 40;
```

### Dynamic Struct Allocation

```bpl
struct Person {
    name: string;
    age: int;
}

frame createPerson(name: string, age: int) ret Person* {
    local p: Person* = cast<Person*>(malloc(sizeof(Person)));
    if (p != null) {
        p->name = name;
        p->age = age;
    }
    return p;
}

# Usage
local person: Person* = createPerson("Alice", 30);
if (person != null) {
    printf("%s is %d years old\n", person->name, person->age);
    free(person);
}
```

### Linked Data Structures

```bpl
struct Node {
    data: int;
    next: Node*;
}

frame createNode(value: int) ret Node* {
    local node: Node* = cast<Node*>(malloc(sizeof(Node)));
    node->data = value;
    node->next = null;
    return node;
}

frame printList(head: Node*) ret void {
    local current: Node* = head;
    loop (current != null) {
        printf("%d -> ", current->data);
        current = current->next;
    }
    printf("NULL\n");
}

# Build a list
local head: Node* = createNode(1);
head->next = createNode(2);
head->next->next = createNode(3);

printList(head);  # 1 -> 2 -> 3 -> NULL
```

## Function Pointers

Function pointers allow you to store and call functions through variables.

### Declaration

```bpl
# Syntax: ret_type (*name)(param_types)
local fp: int (*)(int, int);  # Pointer to function taking 2 ints, returning int
```

### Assignment

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

frame subtract(a: int, b: int) ret int {
    return a - b;
}

local operation: int (*)(int, int);

operation = add;
local result1: int = operation(5, 3);  # 8

operation = subtract;
local result2: int = operation(5, 3);  # 2
```

### Passing Function Pointers

```bpl
frame apply(op: int (*)(int, int), a: int, b: int) ret int {
    return op(a, b);
}

local sum: int = apply(add, 10, 20);      # 30
local diff: int = apply(subtract, 10, 20);  # -10
```

### Array of Function Pointers

```bpl
frame multiply(a: int, b: int) ret int {
    return a * b;
}

frame divide(a: int, b: int) ret int {
    return a / b;
}

# Array of function pointers
local operations: int (*[4])(int, int);
operations[0] = add;
operations[1] = subtract;
operations[2] = multiply;
operations[3] = divide;

# Call through array
loop (local i: int = 0; i < 4; i++) {
    local result: int = operations[i](10, 2);
    printf("Result %d: %d\n", i, result);
}
```

### Callback Pattern

```bpl
frame forEach(arr: int*, size: int, callback: void (*)(int)) ret void {
    loop (local i: int = 0; i < size; i++) {
        callback(arr[i]);
    }
}

frame printValue(x: int) ret void {
    printf("%d\n", x);
}

frame doubleValue(x: int) ret void {
    printf("%d\n", x * 2);
}

# Usage
local numbers: int[5] = [1, 2, 3, 4, 5];
forEach(numbers, 5, printValue);   # Print each
forEach(numbers, 5, doubleValue);  # Print doubled
```

## Double Pointers

Pointers to pointers are useful for modifying pointers in functions.

### Basic Usage

```bpl
local x: int = 42;
local p: int* = &x;
local pp: int** = &p;

printf("%d\n", **pp);  # 42 (double dereference)

**pp = 100;  # Modify x through double pointer
printf("%d\n", x);  # 100
```

### Modifying Pointers in Functions

```bpl
frame allocateArray(arr_ptr: int**, size: int) ret void {
    *arr_ptr = cast<int*>(malloc(size * sizeof(int)));
}

local arr: int* = null;
allocateArray(&arr, 10);  # arr is now allocated

if (arr != null) {
    loop (local i: int = 0; i < 10; i++) {
        arr[i] = i;
    }
    free(arr);
}
```

### Dynamic 2D Arrays

```bpl
# Allocate 2D array as array of pointers
local rows: int = 3;
local cols: int = 4;

local matrix: int** = cast<int**>(malloc(rows * sizeof(int*)));
loop (local i: int = 0; i < rows; i++) {
    matrix[i] = cast<int*>(malloc(cols * sizeof(int)));
}

# Use matrix
matrix[0][0] = 1;
matrix[1][2] = 5;

# Free matrix
loop (local i: int = 0; i < rows; i++) {
    free(matrix[i]);
}
free(matrix);
```

## Null Pointers

### The null Constant

```bpl
local p: int* = null;

if (p == null) {
    printf("Pointer is null\n");
}
```

### Checking Before Dereferencing

```bpl
frame safePrint(p: int*) ret void {
    if (p != null) {
        printf("Value: %d\n", *p);
    } else {
        printf("Null pointer\n");
    }
}
```

### Null After Free

```bpl
local p: int* = cast<int*>(malloc(sizeof(int)));
*p = 42;

free(p);
p = null;  # Good practice: prevent double-free or use-after-free

if (p != null) {
    *p = 10;  # Won't execute
}
```

## Common Pointer Patterns

### Swap Values

```bpl
frame swap(a: int*, b: int*) ret void {
    local temp: int = *a;
    *a = *b;
    *b = temp;
}

local x: int = 5;
local y: int = 10;
swap(&x, &y);
printf("x=%d, y=%d\n", x, y);  # x=10, y=5
```

### Output Parameters

```bpl
frame divmod(dividend: int, divisor: int, quotient: int*, remainder: int*) ret void {
    *quotient = dividend / divisor;
    *remainder = dividend % divisor;
}

local q: int;
local r: int;
divmod(17, 5, &q, &r);
printf("17 / 5 = %d remainder %d\n", q, r);
```

### Returning Multiple Values

```bpl
struct Result {
    success: bool;
    value: int;
}

frame safeDivide(a: int, b: int, result: Result*) ret void {
    if (b == 0) {
        result->success = false;
        result->value = 0;
    } else {
        result->success = true;
        result->value = a / b;
    }
}

local res: Result;
safeDivide(10, 2, &res);
if (res.success) {
    printf("Result: %d\n", res.value);
}
```

### Iterator Pattern

```bpl
struct Iterator {
    current: int*;
    end: int*;

    frame hasNext() ret bool {
        return this.current < this.end;
    }

    frame next() ret int {
        local value: int = *this.current;
        this.current++;
        return value;
    }
}

frame createIterator(arr: int*, size: int) ret Iterator {
    local it: Iterator;
    it.current = arr;
    it.end = arr + size;
    return it;
}

local arr: int[5] = [1, 2, 3, 4, 5];
local it: Iterator = createIterator(arr, 5);
loop (it.hasNext()) {
    printf("%d\n", it.next());
}
```

## Pointer Safety

### Common Mistakes

#### 1. Dereferencing Null Pointer

```bpl
# WRONG
local p: int* = null;
printf("%d\n", *p);  # CRASH!

# CORRECT
local p: int* = null;
if (p != null) {
    printf("%d\n", *p);
}
```

#### 2. Dangling Pointer

```bpl
# WRONG
frame getBadPointer() ret int* {
    local x: int = 42;
    return &x;  # x is destroyed when function returns!
}

# CORRECT
frame getGoodPointer() ret int* {
    local p: int* = cast<int*>(malloc(sizeof(int)));
    *p = 42;
    return p;  # Heap memory persists
}
```

#### 3. Use After Free

```bpl
# WRONG
local p: int* = cast<int*>(malloc(sizeof(int)));
free(p);
*p = 42;  # Undefined behavior!

# CORRECT
local p: int* = cast<int*>(malloc(sizeof(int)));
*p = 42;
# ... use p ...
free(p);
p = null;  # Prevent accidental use
```

#### 4. Double Free

```bpl
# WRONG
local p: int* = cast<int*>(malloc(sizeof(int)));
free(p);
free(p);  # Double free - undefined behavior!

# CORRECT
local p: int* = cast<int*>(malloc(sizeof(int)));
free(p);
p = null;
if (p != null) {
    free(p);  # Won't execute
}
```

#### 5. Memory Leak

```bpl
# WRONG
loop (local i: int = 0; i < 1000; i++) {
    local p: int* = cast<int*>(malloc(sizeof(int)));
    # Never freed - leak!
}

# CORRECT
loop (local i: int = 0; i < 1000; i++) {
    local p: int* = cast<int*>(malloc(sizeof(int)));
    # ... use p ...
    free(p);
}
```

### Best Practices

1. **Always initialize pointers**

   ```bpl
   local p: int* = null;  # Good
   ```

2. **Check allocation success**

   ```bpl
   local p: int* = cast<int*>(malloc(size));
   if (p == null) {
       # Handle error
       return;
   }
   ```

3. **Set to null after free**

   ```bpl
   free(p);
   p = null;
   ```

4. **Check before dereferencing**

   ```bpl
   if (p != null) {
       *p = value;
   }
   ```

5. **Match malloc/free**

   ```bpl
   local p: int* = cast<int*>(malloc(sizeof(int)));
   # ... use p ...
   free(p);  # Every malloc needs a free
   ```

6. **Use const for read-only pointers** (when available)

   ```bpl
   # BPL doesn't have const, but document intent
   # This function won't modify the array
   frame sum(arr: int*, size: int) ret int {
       # Don't modify arr[i]
   }
   ```

7. **Limit pointer arithmetic**

   - Stay within array bounds
   - Use indexes when possible for clarity

8. **Document ownership**
   - Who allocates?
   - Who frees?
   - Make it clear in comments

## Next Steps

- [Memory Management](14-memory.md) - Deep dive into malloc, free, and memory management
- [Arrays](10-arrays-tuples.md) - Advanced array techniques
- [Generics](17-generics.md) - Generic programming with pointers
