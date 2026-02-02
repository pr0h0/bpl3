# Generic Functions

Generic functions allow you to write code that works with multiple types while maintaining full type safety. BPL uses monomorphization, meaning the compiler generates specialized versions of generic functions for each concrete type they're used with.

## Table of Contents

- [Basic Syntax](#basic-syntax)
- [Type Parameters](#type-parameters)
- [Type Inference](#type-inference)
- [Multiple Type Parameters](#multiple-type-parameters)
- [Generic Constraints](#generic-constraints)
- [Common Patterns](#common-patterns)
- [Generic Functions with Pointers](#generic-functions-with-pointers)
- [Best Practices](#best-practices)

## Basic Syntax

Generic parameters are specified in angle brackets `<T>` after the function name:

```bpl
frame identity<T>(val: T) ret T {
    return val;
}
```

**Components:**

- `frame` - Function declaration keyword
- `identity` - Function name
- `<T>` - Generic type parameter(s)
- `(val: T)` - Parameters using the generic type
- `ret T` - Return type using the generic type

## Type Parameters

### Single Type Parameter

The most common case is a single type parameter:

```bpl
# Identity function - returns whatever is passed
frame identity<T>(val: T) ret T {
    return val;
}

# Get first element of a tuple
frame first<T, U>(pair: (T, U)) ret T {
    local (a, _) = pair;
    return a;
}
```

### Type Parameter Naming Conventions

By convention, type parameters use single uppercase letters:

- `T` - General type (most common)
- `U`, `V` - Additional types
- `K` - Key type (for maps/dictionaries)
- `V` - Value type (for maps/dictionaries)
- `E` - Element type (for collections)
- `R` - Return type

## Type Inference

When calling a generic function, the compiler can often infer the type arguments from the provided values:

```bpl
extern printf(fmt: string, ...);

frame identity<T>(val: T) ret T {
    return val;
}

frame main() ret int {
    # Type is inferred from the argument
    local x: int = identity(42);        # T inferred as int
    local y: float = identity(3.14);    # T inferred as float
    local z: string = identity("hello"); # T inferred as string

    printf("x=%d, y=%f, z=%s\n", x, y, z);
    return 0;
}
```

### Explicit Type Arguments

You can also specify type arguments explicitly when needed:

```bpl
extern printf(fmt: string, ...);

frame identity<T>(val: T) ret T {
    return val;
}

frame main() ret int {
    # Explicit type specification
    local x: int = identity<int>(42);
    local y: float = identity<float>(3.14);

    # Explicit types are required when inference is ambiguous
    local ptr: *int = nullptr;
    local nullPtr: *int = identity<*int>(ptr);

    return 0;
}
```

## Multiple Type Parameters

Functions can have multiple type parameters:

```bpl
extern printf(fmt: string, ...);

# Swap two values of different types isn't useful,
# but swapping same types is!
frame swap<T>(a: *T, b: *T) ret void {
    local temp: T = *a;
    *a = *b;
    *b = temp;
}

# Create a pair from two values
frame makePair<T, U>(first: T, second: U) ret (T, U) {
    return (first, second);
}

# Apply a function to transform a value
frame map<T, U>(value: T, transform: Lambda<U>(T)) ret U {
    return transform(value);
}

frame main() ret int {
    # Swap integers
    local x: int = 1;
    local y: int = 2;
    swap<int>(&x, &y);
    printf("After swap: x=%d, y=%d\n", x, y);

    # Create pairs with different types
    local pair1: (int, string) = makePair<int, string>(42, "answer");
    local (num, str) = pair1;
    printf("Pair: (%d, %s)\n", num, str);

    # Map with lambda
    local doubled: int = map<int, int>(5, |n: int| ret int { return n * 2; });
    printf("Doubled: %d\n", doubled);

    return 0;
}
```

## Generic Constraints

BPL supports type constraints using the `spec` keyword (specifications/interfaces):

```bpl
# Define a specification that types must implement
spec Printable {
    frame print(this: *Self) ret void;
}

# Generic function constrained to Printable types
frame printAll<T: Printable>(items: *T[], count: int) ret void {
    loop (local i: int = 0; i < count; i = i + 1) {
        items[i].print();
    }
}
```

## Common Patterns

### Generic Swap

```bpl
extern printf(fmt: string, ...);

frame swap<T>(a: *T, b: *T) ret void {
    local temp: T = *a;
    *a = *b;
    *b = temp;
}

frame main() ret int {
    local x: int = 10;
    local y: int = 20;
    printf("Before: x=%d, y=%d\n", x, y);

    swap<int>(&x, &y);
    printf("After: x=%d, y=%d\n", x, y);

    # Works with any type
    local a: float = 1.5;
    local b: float = 2.5;
    swap<float>(&a, &b);
    printf("Floats: a=%f, b=%f\n", a, b);

    return 0;
}
```

### Generic Min/Max

```bpl
extern printf(fmt: string, ...);

frame min<T>(a: T, b: T, less: Lambda<bool>(T, T)) ret T {
    if (less(a, b)) {
        return a;
    }
    return b;
}

frame max<T>(a: T, b: T, less: Lambda<bool>(T, T)) ret T {
    if (less(a, b)) {
        return b;
    }
    return a;
}

frame main() ret int {
    local intLess: Lambda<bool>(int, int) = |a: int, b: int| ret bool {
        return a < b;
    };

    local smaller: int = min<int>(10, 5, intLess);
    local larger: int = max<int>(10, 5, intLess);

    printf("Min: %d, Max: %d\n", smaller, larger);
    return 0;
}
```

### Generic Array Operations

```bpl
extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame forEach<T>(arr: *T, len: int, action: Lambda<void>(T)) ret void {
    loop (local i: int = 0; i < len; i = i + 1) {
        action(arr[i]);
    }
}

frame find<T>(arr: *T, len: int, predicate: Lambda<bool>(T)) ret int {
    loop (local i: int = 0; i < len; i = i + 1) {
        if (predicate(arr[i])) {
            return i;
        }
    }
    return -1;  # Not found
}

frame main() ret int {
    local arr: int[5] = [1, 2, 3, 4, 5];

    # Print each element
    forEach<int>(&arr[0], 5, |n: int| ret void {
        printf("%d ", n);
    });
    printf("\n");

    # Find first element > 3
    local idx: int = find<int>(&arr[0], 5, |n: int| ret bool {
        return n > 3;
    });
    printf("First element > 3 at index: %d\n", idx);

    return 0;
}
```

## Generic Functions with Pointers

Generics work seamlessly with pointer types:

```bpl
extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

# Allocate and initialize a value on the heap
frame boxed<T>(value: T) ret *T {
    local ptr: *T = cast<*T>(malloc(sizeof(T)));
    *ptr = value;
    return ptr;
}

# Safely dereference with a default
frame derefOr<T>(ptr: *T, defaultVal: T) ret T {
    if (ptr == nullptr) {
        return defaultVal;
    }
    return *ptr;
}

frame main() ret int {
    # Box an integer
    local boxedInt: *int = boxed<int>(42);
    printf("Boxed value: %d\n", *boxedInt);
    free(cast<*void>(boxedInt));

    # Safe dereference
    local ptr: *int = nullptr;
    local val: int = derefOr<int>(ptr, -1);
    printf("Value (or default): %d\n", val);

    return 0;
}
```

## Best Practices

### 1. Use Meaningful Type Parameter Names

```bpl
# Good: Clear what K and V represent
frame mapGet<K, V>(key: K) ret V { ... }

# Less clear: What are T and U?
frame mapGet<T, U>(key: T) ret U { ... }
```

### 2. Prefer Type Inference When Unambiguous

```bpl
# Good: Type is clear from context
local x: int = identity(42);

# Unnecessary: Explicit type when inference works
local y: int = identity<int>(42);

# Necessary: When type can't be inferred
local ptr: *int = identity<*int>(nullptr);
```

### 3. Document Type Constraints

```bpl
# Document what T must support
# T must have a < operator or provide a comparison function
frame sort<T>(arr: *T, len: int, compare: Lambda<int>(T, T)) ret void {
    # ...
}
```

### 4. Keep Generic Functions Focused

```bpl
# Good: Single responsibility
frame swap<T>(a: *T, b: *T) ret void { ... }
frame min<T>(a: T, b: T, less: Lambda<bool>(T, T)) ret T { ... }

# Avoid: Too many concerns in one function
frame swapAndPrintAndCompare<T>(...) { ... }
```

## How Monomorphization Works

When you use a generic function with a specific type, the compiler generates a specialized version:

```bpl
# Your code
frame identity<T>(val: T) ret T {
    return val;
}

local x: int = identity(42);
local y: float = identity(3.14);
```

The compiler internally creates:

```bpl
# Generated: identity<int>
frame identity_int(val: int) ret int {
    return val;
}

# Generated: identity<float>
frame identity_float(val: float) ret float {
    return val;
}
```

This means:

- **No runtime overhead** - Generics are resolved at compile time
- **Type-specific optimizations** - Each specialization can be optimized
- **Larger binary size** - Each type combination creates new code

---

**Next:** Learn about [Structs](11-structs.md) to create custom data types that work with generics.
