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
    local p: Point; # Implicitly calls p.new()
}
```

### Generic Structs

Implicit constructors also work with generic structs. This allows you to specialize initialization logic based on the type parameter.

To check the type of a generic parameter `T` inside the constructor without potentially triggering recursive constructors or side effects (if `T` is a complex type), use the pattern of declaring a dummy variable initialized to 0.

```bpl
extern memcpy(dest: *void, src: *void, n: int) ret *void;

struct Point<T> {
    x: T,
    y: T,

    frame new(this: *Point<T>) {
        # Use a dummy variable initialized to 0 to check the type T.
        # This avoids triggering any potential constructors for T itself.
        local dummy: T = 0;

        if ((dummy is int)) {
            local val_x: int = 10;
            local val_y: int = 20;
            # Use memcpy for generic field assignment to bypass type checking limitations
            memcpy(cast<*void>(&this.x), cast<*void>(&val_x), sizeof(int));
            memcpy(cast<*void>(&this.y), cast<*void>(&val_y), sizeof(int));
        } else if ((dummy is char)) {
            local val_x: char = 'a';
            local val_y: char = 'b';
            memcpy(cast<*void>(&this.x), cast<*void>(&val_x), sizeof(char));
            memcpy(cast<*void>(&this.y), cast<*void>(&val_y), sizeof(char));
        }
    }
}

frame main() {
    local p: Point<int>; # Implicitly calls Point<int>.new(&p)
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
