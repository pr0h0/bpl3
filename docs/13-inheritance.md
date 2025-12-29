# Inheritance

BPL supports single inheritance for structs. All structs implicitly inherit from the root `Type` struct if no other parent is specified.

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
struct Animal {
    name: string
}

struct Dog : Animal {
    breed: string
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

All user-defined structs implicitly inherit from `Type` (defined in `std/type.bpl`). This provides common methods like:

- `getTypeName() ret string`
- `toString() ret string`
- `destroy()`

You can override these methods in your structs to provide custom string representations or cleanup logic.

```bpl
struct Point {
    x: int,
    y: int,

    frame toString(this: *Point) ret string {
        return "Point(" + this.x.toString() + ", " + this.y.toString() + ")";
    }
}
```
