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
-   **Recursion**: Functions calling themselves.
-   **Input**: Using `scanf` from C standard library.

## 2. Structs and Arrays (`example/structs_arrays/structs_arrays.x`)

Demonstrates how to define complex data structures and manage collections.

```bpl
struct Point {
    x: u64,
    y: u64
}

global points: Point[5];
```

**Key Concepts:**
-   **Structs**: Grouping data (`x`, `y`).
-   **Arrays**: Fixed-size collections.
-   **Access**: `points[i].x` syntax.

## 3. Linked List (`example/linked_list/linked_list.x`)

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
-   **Pointers**: `*Node` to link structures.
-   **Malloc**: Allocating memory on the heap.
-   **Null**: Checking for end of list.

## 4. Hotel Management System (`example/hotel/`)

A multi-file project demonstrating modular architecture.

-   `hotel.x`: Main entry point.
-   `rooms.x`: Room management logic.
-   `reservations.x`: Reservation handling.
-   `auth.x`: User authentication.
-   `types.x`: Shared struct definitions.

**Key Concepts:**
-   **Modules**: Splitting code into logical units.
-   **Imports**: `import ... from "./file.x"`.
-   **State Management**: Managing global state across modules.

## 5. Inline Assembly (`example/asm_demo/asm_demo.x`)

Demonstrates low-level hardware access.

```bpl
asm {
    rdrand rax;      ; Hardware random number generator
    mov (rnd), rax;  ; Store in BPL variable
}
```

**Key Concepts:**
-   **`asm` block**: Writing raw assembly.
-   **Interpolation**: Accessing BPL variables `(rnd)` inside assembly.
-   **System Calls**: Direct kernel interaction.
