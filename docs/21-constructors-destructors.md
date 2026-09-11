# Constructors and Destructors

While BPL is not a fully object-oriented language like C++, it supports patterns for object lifecycle management.

## Constructors

Constructors are typically static methods that return a new instance of a struct.

```bpl
struct String {
    data: *char,
    len: int,

    frame new(s: *char) ret String {
        local str: String;
        str.data = s; # Simplified
        str.len = 0;  # Simplified
        return str;
    }
}
```

## Implicit Constructors

BPL supports implicit constructor calls for local variables. If a struct defines a method named `new` that takes a pointer to the instance (`this`) as its first argument, the compiler will automatically call this method when a variable of that struct type is declared without an explicit initializer.

### Concrete Structs

For regular structs, simply define a `new` method.

```bpl
import printf from "std/c.bpl";
struct Point {
    x: int,
    y: int,

    frame new(this: *Point) {
        this.x = 0;
        this.y = 0;
        printf("Point initialized\n");
    }
}

frame main() {
    local _p: Point; # Implicitly calls p.new()
}
```

### Generic Structs

Implicit constructors also work with generic structs. This example initializes
container bookkeeping without constructing an arbitrary value of `T`:

```bpl
import printf from "std/c.bpl";

struct Buffer<T> {
    data: *T,
    length: int,
    frame new(this: *Buffer<T>) {
        this.data = nullptr;
        this.length = 0;
    }
}

frame main() ret int {
    local buffer: Buffer<int>;
    printf("Length: %d\n", buffer.length);
    return 0;
}
```

## Destructors

Destructors are methods that clean up resources. By default, a `destroy(this: *T)` method is just an ordinary method and must be called manually. If it is marked with `@[auto_destroy]`, BPL automatically calls it for value locals when their scope exits, including early returns. Returned locals are treated as moved and are not destroyed before the caller receives them.

If a struct inherits from other structs, calling its destructor also runs parent destructors through the generated destructor chain.

```bpl
extern free(ptr: *void);

struct String {
    data: *char,
    len: int,

    @[auto_destroy]
    frame destroy(this: *String) ret void {
        free(cast<*void>(this.data));
    }
}
```
