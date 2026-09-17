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

Ownership is followed into the value. A local destroys the marked types it holds
in fixed-size array elements and in struct fields, at any depth, even when the
local's own type declares no destructor:

```bpl
local items: Resource[2];   # both elements destroyed at scope exit
local holder: Holder;       # holder.inner destroyed if Resource is marked
```

The order is the reverse of construction: a value's own destructor runs first,
then the elements and fields it owns, each in reverse declaration order. Moving
a local moves everything it owns, so returning or throwing it destroys none of
its elements or fields in that frame. A local that a destructor will read is
zeroed at its declaration, so an unassigned one is destroyed as a zeroed value
rather than as whatever the stack held.

Generic type arguments are followed too: `Box<Resource>` destroys the
`Resource` it holds, and a local declared as a generic function's type
parameter is destroyed when that instance's argument owns a destructor.

Tuple elements are followed like struct fields, and a local bound by tuple
destructuring is an ordinary local that destroys what it holds.

Only fixed array dimensions are walked. Values reached through a pointer or a
slice are not owned by the local, so they are not destroyed; free those
explicitly or with `defer`.

An enum payload cannot hold a type with `@[auto_destroy]`
(`BPL_AUTO_DESTROY_ENUM_PAYLOAD`). Which payload is present is only known at
run time, so cleanup would have to choose a destructor from the tag, which is
not implemented. Rather than skip it silently and leak, the enum declaration is
rejected. Hold a pointer in the payload and free it explicitly, or drop the
attribute and call `destroy` yourself.

A `throw` also destroys the live locals of the frame it leaves: cleanup runs from
the innermost scope out to the nearest enclosing `try` in that frame, or to the
whole function when the frame has no handler. A local moved into the thrown value
is not destroyed. Two limits apply on that path: a frame between the throwing
function and the handler that has no `try` of its own is skipped by the unwinder,
so its locals are not destroyed, and destructors of the throwing frame run before
`defer` blocks rather than interleaving with them in declaration order. Use
`defer` for cleanup that must run in every one of those cases.

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
