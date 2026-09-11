# Struct Primitive Inheritance

BPL allows structs to inherit from primitive types, enabling you to create specialized types that behave like primitives but can have additional methods and fields.

## Syntax

```bpl
struct MyInt : int {
    # Methods can be added
    frame isEven(this: *MyInt) ret bool {
        return (cast<int>(*this) % 2) == 0;
    }
}
```

## Usage

Instances of the struct can be used wherever the primitive type is expected (implicit conversion).

```bpl
import printf from "std/c.bpl";

struct MyInt : int {
    frame isEven(this: *MyInt) ret bool { return (cast<int>(*this) % 2) == 0; }
}

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

The layout includes the primitive payload (conceptually `__base__`) and may
include a vtable pointer before that payload. Use `cast<int>(value)` to unwrap
a value; reinterpreting the object pointer as `*int` can read the vtable instead.

If the struct has no other fields and no virtual methods, it has the same memory layout as the primitive type.
