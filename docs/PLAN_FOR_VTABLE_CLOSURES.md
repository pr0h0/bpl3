# Plan for Refactoring VTables and Closures

## 1. Executive Summary

This document outlines a plan to refactor the internal representation of functions, structs, and polymorphism in the BPL compiler. The goal is to achieve **C-compatibility (FFI)**, **predictable memory layouts**, and **zero-cost abstractions**.

Currently, BPL imposes hidden overheads:

1.  **Functions** are always "fat pointers" (16 bytes), making them incompatible with C function pointers.
2.  **Structs** with methods carry a hidden `__vtable__` pointer, altering their size and layout.

The proposed solution involves splitting function types into **Raw Pointers** (`Func`) and **Closures** (`Lambda`), and moving dynamic dispatch information from the **Object** to the **Reference** (Fat Pointers/Specs).

## 2. The Problem

### 2.1. The "Fat Pointer" Function

Currently, every `Func<Ret>(Args)` in BPL is represented as:

```c
struct BPLFunction {
    void* func_ptr;    // Pointer to code
    void* context_ptr; // Pointer to captured environment (or NULL)
};
```

**Issues:**

- **FFI Incompatibility:** C expects `void (*)(...)` (8 bytes). Passing a BPL function to `qsort` or `pthread_create` fails or requires complex wrappers.
- **Overhead:** Simple global functions carry unused context pointers.

### 2.2. The Hidden VTable

Currently, any struct with methods has a hidden field:

```c
struct Point {
    void* __vtable__; // Hidden 8 bytes
    int x;
    int y;
};
```

**Issues:**

- **Layout Mismatch:** `sizeof(Point)` is 16 bytes, but a C equivalent is 8 bytes.
- **Serialization:** Writing this struct to disk/network writes the memory address of the vtable, which is invalid on reload.
- **Performance:** Unnecessary overhead for statically dispatched calls (which are the majority).

## 3. Proposed Solution: Functions

We will distinguish between **Raw Functions** and **Closures**.

### 3.1. Raw Function Pointers (`Func`)

- **Syntax:** `Func<Ret>(Args)`
  - Example: `Func<int>(int, string)`
- **Representation:** A single 64-bit pointer to the machine code.
- **Capabilities:** Can point to global functions or static methods. **Cannot capture variables.**
- **FFI:** 100% compatible with C function pointers.

### 3.2. Closures (`Lambda`)

- **Syntax:** `Lambda<Ret>(Args)`
  - Example: `Lambda<int>(char, char)`
- **Representation:** A struct containing:
  1.  `fn_ptr`: Pointer to a "trampoline" function.
  2.  `ctx_ptr`: Pointer to the captured environment.
- **Capabilities:** Can capture local variables.
- **FFI:** Incompatible with C directly. Must be unpacked manually if the C API supports a `void* user_data` argument.

## 4. Proposed Solution: Structs & Polymorphism

We will move from **Inheritance-based VTables** to **Spec-based Fat Pointers**.

### 4.1. Plain Old Data (POD) Structs

Structs will no longer have hidden fields.

```bpl
struct Point {
    x: int,
    y: int,

    frame distance(this: Point) ret float { ... }
}
```

- **Memory Layout:** Exactly 8 bytes (`x` + `y`).
- **Dispatch:** `p.distance()` is resolved at **compile time** (Static Dispatch). No vtable lookup.

### 4.2. Specs (Interfaces)

To support polymorphism (calling different implementations via a common type), we reuse the existing `spec` keyword.

```bpl
spec Printable {
    frame print(this);
}

struct Circle : Printable { ... }
struct Square : Printable { ... }
```

### 4.3. Spec Objects (Fat Pointers)

When a struct is cast to a spec, we create a **Fat Pointer**:

```bpl
local c: Circle;
local d: Printable = c; // Implicit cast
```

**Under the hood representation of `d`:**

```c
struct Printable_Ref {
    void* object_ptr;  // Points to 'c'
    void* vtable_ptr;  // Points to 'Circle_as_Printable_vtable'
};
```

- **The VTable is carried by the variable `d`, not the object `c`.**
- This is how Rust (`&dyn Trait`) and Go (`interface{}`) work.
- **Benefit:** You only pay for the vtable overhead when you actually use polymorphism.

## 5. Implementation Plan

### Phase 1: Split Function Types

1.  **Parser:** Update grammar to accept `Func` (raw) and `Lambda` (captured) types.
    - `Func` replaces the current "fat pointer" `Func` implementation.
    - `Lambda` is introduced for capturing closures.
2.  **Type Checker:**
    - **Capture Analysis:** The compiler analyzes the lambda body to identify captured variables.
      - If captures are found -> **Capturing Lambda**.
      - If no captures -> **Stateless Lambda**.
    - **Conversions:**
      - `Func` -> `Lambda`: Implicit (creates dummy context).
      - `Stateless Lambda` -> `Func`: Implicit (returns raw function pointer).
      - `Capturing Lambda` -> `Func`: **Error**.
3.  **Codegen:**
    - `Func` generates `i8*` (or typed function pointer).
    - `Lambda` generates `{ i8*, i8* }`.

### Phase 2: Remove Struct VTables

1.  **Type Checker:** Stop injecting `__vtable__` field into structs.
2.  **Codegen:**
    - Remove vtable initialization code in constructors.
    - Ensure all method calls use direct function calls (Static Dispatch).
3.  **Inheritance:** Implement "struct embedding" for inheritance.
    - Child struct layout: `[ Parent Fields | Child Fields ]`.
    - Casting `*Child` to `*Parent` is a no-op (pointer remains same).

### Phase 3: Implement Specs (Fat Pointers)

1.  **Syntax:** Ensure `spec` and inheritance syntax (`:`) are fully supported for this model.
2.  **VTable Generation:**
    - Generate a static vtable for every `Struct + Spec` pair.
    - Example: `@Circle_Printable_VTable`.
3.  **Fat Pointer Generation:**
    - When casting `Struct` -> `Spec`, generate the `{ obj, vtable }` pair.
    - Method calls on specs load the function from the vtable pointer.

## 6. Code Examples & Comparison

### 6.1. FFI with C (qsort)

**Current (Broken/Hard):**

```bpl
# Cannot pass BPL function directly because it's 16 bytes
extern qsort(...);
```

**New (Clean):**

```bpl
# 'Func' is a raw pointer
extern qsort(base: *void, num: int, size: int, cmp: Func<int>(*void, *void));

frame my_cmp(a: *void, b: *void) ret int { ... }

frame main() {
    # Passes raw function pointer directly
    qsort(arr, 10, 4, my_cmp);
}
```

### 6.2. Polymorphism

**Current (Hidden Cost):**

```bpl
struct Shape { ... } # Has hidden vtable
struct Circle: Shape { ... } # Has hidden vtable

frame draw(s: *Shape) {
    s.draw(); # VTable lookup on object
}
```

**New (Zero Cost Default, Explicit Dynamic):**

```bpl
spec Drawable {
    frame draw(this);
}

struct Circle { ... } # No vtable, just data

frame draw_static(c: *Circle) {
    c.draw(); # Direct call, fast, inlined
}

frame draw_dynamic(d: Drawable) {
    d.draw(); # VTable lookup via 'd' (Fat Pointer)
}
```

### 6.3. Method Overriding vs. Shadowing

In this new model, `struct` inheritance is purely for **Data Layout** and **Code Reuse**. It does **not** imply polymorphism by default.

**Scenario:**

```bpl
struct Parent {
    frame foo(this) { print("Parent"); }
}

struct Child : Parent {
    # This 'shadows' Parent.foo, it does not 'override' it in a vtable
    frame foo(this) { print("Child"); }
}
```

**Static Dispatch (Default behavior):**
If you use raw pointers, the compiler calls the method matching the _pointer type_.

```bpl
frame test_static(p: *Parent) {
    p.foo(); # Always calls Parent.foo(), even if p points to a Child!
}

local c: Child;
test_static(&c); # Prints "Parent"
```

**Dynamic Dispatch (How to achieve overriding):**
To get polymorphic behavior (calling `Child.foo` via a generic handle), you must use a **Spec**.

```bpl
spec Fooable {
    frame foo(this);
}

# Both structs implement the spec
struct Parent : Fooable { ... }
struct Child : Parent, Fooable { ... }

frame test_dynamic(obj: Fooable) {
    obj.foo(); # Calls the implementation specific to the runtime object
}

local c: Child;
test_dynamic(c); # Prints "Child"
```

## 7. Benefits Summary

1.  **Interoperability:** BPL structs and functions become binary-compatible with C.
2.  **Performance:**
    - No vtable overhead for standard structs.
    - Better cache locality (smaller structs).
    - Static dispatch allows inlining.
3.  **Predictability:** `sizeof(T)` is exactly the sum of its fields.
4.  **Flexibility:** Specs allow retrofitting polymorphism onto existing types without changing their layout.
