# Examples Cookbook

This document walks through some of the examples provided in the `example/` directory to demonstrate real-world usage of BPL.

## 1. Fibonacci Sequence (`example/fib/fib.x`)

Demonstrates recursion, loops, and user input.

```bpl
# Recursive implementation
frame fib_recursive(n: u64) ret u64 {
  if n <= 1 {
    return n;
  }
  return call fib_recursive(n - 1) + call fib_recursive(n - 2);
}
```

**Key Concepts:**

- **Recursion**: Functions calling themselves.
- **Input**: Using `scanf` from C standard library.

## 2. Structs and Arrays (`example/structs_arrays/structs_arrays.x`)

Demonstrates how to define complex data structures and manage collections.

```bpl
struct Point {
    x: u64,
    y: u64
}

global points: Point[5];

frame main() ret u8 {
    # Initialize with struct literal (positional)
    local p1: Point = {10, 20};

    # Initialize with named fields
    local p2: Point = {y: 30, x: 40};

    # Array initialization
    points[0] = p1;
    points[1] = {50, 60};  # Direct literal assignment

    return 0;
}
```

**Key Concepts:**

- **Structs**: Grouping data (`x`, `y`).
- **Struct Literals**: Initializing structs with `{...}` syntax (positional or named).
- **Arrays**: Fixed-size collections.
- **Access**: `points[i].x` syntax.

## 3. Struct Methods (`example/struct_methods/user.x`)

Demonstrates how to add methods to structs for object-oriented style programming.

```bpl
import printf from "libc";

struct User {
    name: *u8,
    age: i32,

    frame sayHello() {
        call printf("Hello, my name is %s and I am %d years old\n",
                    this.name, this.age);
    }

    frame setAge(newAge: i32) {
        this.age = newAge;
    }

    frame isAdult() ret i8 {
        if this.age >= 18 {
            return 1;
        }
        return 0;
    }
}

frame main() ret i32 {
    local user: User;
    user.name = "Alice";
    user.age = 25;

    call user.sayHello();
    call user.setAge(30);

    local adult: i8 = call user.isAdult();
    return 0;
}
```

**Key Concepts:**

- **Methods**: Functions defined inside structs using `frame`.
- **The `this` keyword**: Implicit pointer to the current struct instance.
- **Method calls**: Using `call obj.method(args)` syntax.
- **Encapsulation**: Grouping behavior with data.
- **Mutation**: Methods can modify struct fields via `this.field = value`.

### Generic Struct Methods (`example/struct_methods/generics_methods.x`)

Demonstrates generic structs with methods.

```bpl
import printf from "libc";

struct Box<T> {
    value: T,

    frame getValue() ret T {
        return this.value;
    }

    frame setValue(val: T) {
        this.value = val;
    }
}

frame main() ret i32 {
    local b: Box<u64>;
    call b.setValue(42);
    local v: u64 = call b.getValue();
    call printf("%llu\n", v);  # Prints: 42
    return 0;
}
```

**Key Concepts:**

- **Generic Structs**: Use `<T>` syntax for type parameters.
- **Generic Methods**: Methods can use generic type parameters.
- **Type Substitution**: Generic types are resolved at instantiation.

### Nested Method Calls (`example/struct_methods/nested_generics.x`)

Demonstrates calling methods on nested struct fields.

```bpl
import printf from "libc";

struct Inner<T> {
    data: T,

    frame getData() ret T {
        return this.data;
    }
}

struct Outer<T> {
    inner: Inner<T>,

    frame getInnerData() ret T {
        return call this.inner.getData();
    }
}

frame main() ret i32 {
    local obj: Outer<u64>;
    obj.inner.data = 100;

    # Nested method call
    local val: u64 = call obj.inner.getData();
    call printf("%llu\n", val);  # Prints: 100

    # Method calling nested method
    local val2: u64 = call obj.getInnerData();
    call printf("%llu\n", val2);  # Prints: 100

    return 0;
}
```

**Key Concepts:**

- **Nested Method Calls**: `call obj.field.method()` syntax.
- **Chained Member Access**: Access fields through multiple levels.
- **Generic Nesting**: Outer structs can pass generic types to inner structs.

## 5. Linked List (`example/linked_list/linked_list.x`)

Demonstrates dynamic memory allocation and pointer manipulation.

```bpl
struct Node {
    value: u64,
    next: *Node
}

frame create_node(val: u64) ret *Node {
    local node: *Node = call malloc(16); # Size of Node
    node.value = val;
    node.next = null;
    return node;
}
```

**Key Concepts:**

- **Pointers**: `*Node` to link structures.
- **Malloc**: Allocating memory on the heap.
- **Null**: Checking for end of list.

## 6. Hotel Management System (`example/hotel/`)

A multi-file project demonstrating modular architecture.

- `hotel.x`: Main entry point.
- `rooms.x`: Room management logic.
- `reservations.x`: Reservation handling.
- `auth.x`: User authentication.
- `types.x`: Shared struct definitions.

**Key Concepts:**

- **Modules**: Splitting code into logical units.
- **Imports**: `import ... from "./file.x"`.
- **State Management**: Managing global state across modules.

## 7. Inline Assembly (`example/asm_demo/asm_demo.x`)

Demonstrates low-level hardware access.

```bpl
asm {
    rdrand rax;      ; Hardware random number generator
    mov (rnd), rax;  ; Store in BPL variable
}
```

**Key Concepts:**

- **`asm` block**: Writing raw assembly.
- **Interpolation**: Accessing BPL variables `(rnd)` inside assembly.
- **System Calls**: Direct kernel interaction.

## 8. Struct Literal Initialization (`example/struct_literal_demo/`)

Demonstrates the various ways to initialize structs using literal syntax.

```bpl
struct Color {
    r: i32,
    g: i32,
    b: i32,
}

frame main() ret i32 {
    # Positional initialization
    local c1: Color = {255, 128, 64};

    # Named initialization (any order)
    local c2: Color = {b: 100, g: 200, r: 50};

    # Nested structs
    struct Point3D {
        x: i32,
        y: i32,
        z: i32,
        color: Color,
    }

    local p: Point3D = {
        x: 10,
        y: 20,
        z: 30,
        color: {r: 255, g: 255, b: 255}
    };

    return 0;
}
```

**Key Concepts:**

- **Positional Syntax**: `{value1, value2, ...}` - fields assigned in declaration order.
- **Named Syntax**: `{field: value, ...}` - fields can be in any order.
- **Nested Structs**: Struct literals can be nested for complex initialization.
- **Restriction**: Cannot mix positional and named initialization in the same literal.

## 9. Division Semantics (`example/division_demo/division_demo.x`)

Demonstrates the difference between float division (`/`) and integer/floor division (`//`).

```bpl
local a: u64 = 10;
local b: u64 = 3;

# Float Division (always returns float)
local f_res: f64 = a / b; # 3.333...

# Integer Division (truncating for integers)
local i_res: u64 = a // b; # 3

# Floor Division (for floats)
local x: f64 = 10.5;
local y: f64 = 3.2;
local floor_res: f64 = x // y; # 3.0
```

**Key Concepts:**

- **`/` Operator**: Performs floating-point division, promoting integers to floats if necessary.
- **`//` Operator**: Performs integer division for integers (truncating) and floor division for floats.
