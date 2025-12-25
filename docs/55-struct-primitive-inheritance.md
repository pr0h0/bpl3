# Struct Primitive Inheritance

BPL allows structs to inherit from primitive types, enabling you to create specialized types that behave like primitives but can have additional methods and fields.

## Syntax

```bpl
struct MyInt : int {
    # Methods can be added
    frame isEven(this: *MyInt) ret bool {
        return (*cast<*int>(this) % 2) == 0;
    }
}
```

## Usage

Instances of the struct can be used wherever the primitive type is expected (implicit conversion).

```bpl
frame printInt(x: int) {
    printf("%d\n", x);
}

frame main() ret int {
    local m: MyInt = cast<MyInt>(42);

    # Call method on struct
    if (m.isEven()) {
        printf("Even!\n");
    }

    # Pass to function expecting int
    printInt(m); # Implicitly converted to int

    return 0;
}
```

## Casting

You can cast between the struct and the primitive type:

- `cast<MyInt>(int_value)`: Wraps the integer in the struct.
- `cast<int>(my_int_instance)`: Unwraps the integer from the struct.

## Memory Layout

The struct will contain the primitive value as its first field (conceptually `__base__`). If the struct has virtual methods (or inherits from a struct with virtual methods), it will also have a vtable pointer.

If the struct has no other fields and no virtual methods, it has the same memory layout as the primitive type.
