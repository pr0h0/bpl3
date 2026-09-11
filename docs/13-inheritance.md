# Inheritance

BPL supports single inheritance for structs. Structs with methods implicitly inherit from the root `Type` when no parent is specified. Method-free structs without inheritance can retain a plain C-compatible layout.

## Syntax

Use the `:` operator to specify the parent struct.

```bpl
struct Animal {
    name: string,
    frame makeSound(this: *Animal) {
        printf("Animal sound\n");
    }
}

struct Dog : Animal {
    breed: string,
    # Override the makeSound method
    frame makeSound(this: *Dog) {
        printf("Woof!\n");
    }
}
```

## Memory Layout

The fields of the parent struct are included at the beginning of the child struct. This allows for safe casting (pointer casting) from `Child*` to `Parent*`.

If a struct has virtual methods (methods that are overridden or inherited), it will contain a hidden **vtable pointer** as its first field (offset 0). The actual data fields start after this pointer.

```bpl
import printf from "std/c.bpl";

struct Animal {
    name: string,
    frame makeSound(this: *Animal) { printf("Animal sound\n"); }
}

struct Dog : Animal {
    breed: string,
    frame makeSound(this: *Dog) { printf("Woof!\n"); }
}

frame main() ret int {
    local d: Dog;
    d.name = "Rex";
    d.breed = "Labrador";

    # Upcasting
    local a: *Animal = &d;
    a.makeSound(); # Calls Dog.makeSound via vtable

    return 0;
}
```

## Method Overriding & Virtual Dispatch

Methods declared in a parent struct can be overridden in a child struct by defining a method with the same name.

- **Virtual Dispatch**: When a method is called on a pointer to a parent type, the runtime looks up the actual implementation in the vtable of the object. This ensures the correct method (e.g., `Dog.makeSound`) is called even if the variable is of type `*Animal`.
- **VTable**: The compiler automatically generates a Virtual Method Table (vtable) for each struct that participates in inheritance.

## Calling Parent Methods (Super)

BPL does not have a `super` keyword. Instead, you can call a parent's method implementation explicitly by using the parent struct's name and passing the object pointer (`this`) as the first argument.

This bypasses virtual dispatch and calls the specific implementation defined in the parent struct.

```bpl
struct Animal {
    frame speak(this: *Animal) {
        printf("Animal speaks\n");
    }
}

struct Dog : Animal {
    frame speak(this: *Dog) {
        printf("Dog barks\n");

        # Call parent implementation (super.speak())
        Animal.speak(this);
    }
}
```

## The `Type` Root Struct

Structs with methods and no explicit parent implicitly inherit from `Type` (defined in `std/type.bpl`). This provides common methods like:

- `getTypeName() ret string`
- `toString() ret string`
- `destroy()`

You can override these methods in your structs to provide custom string representations or cleanup logic.

```bpl
struct Point {
    x: int,
    y: int,

    frame toString(this: *Point) ret string {
        return "Point"; # A borrowed string literal; no allocation to release.
    }
}
```
