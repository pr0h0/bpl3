# Struct Methods

Structs can have methods associated with them.

## Instance Methods

Instance methods take `this` as the first parameter. The type of `this` must be the struct type or a pointer to it.

```bpl
frame sqrt(x: float) ret float { return x; }

struct Vector {
    x: int,
    y: int,

    frame length(this: *Vector) ret float {
        return sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}
```

## Static Methods

Static methods are defined inside the struct but do not take `this` as a parameter.

```bpl
struct Vector {
    x: int,
    y: int,

    frame zero() ret Vector {
        local v: Vector;
        v.x = 0;
        v.y = 0;
        return v;
    }
}
```

## Calling Methods

```bpl
extern printf(fmt: string, ...);
frame sqrt(x: float) ret float { return x; }

struct Vector {
    x: int,
    y: int,

    frame zero() ret Vector {
        local v: Vector;
        v.x = 0;
        v.y = 0;
        return v;
    }

    frame length(this: *Vector) ret float {
        return sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}

frame main() ret int {
    local v: Vector = Vector.zero();
    local len: float = v.length();
    printf("%f", len);
    return 0;
}
```

## Explicit Method Invocation

Member methods can also be called statically by using the struct name and passing the object instance (or pointer) as the first argument explicitly.

```bpl
local v: Vector;
v.x = 3;
v.y = 4;

# Standard method call syntax
v.length();

# Explicit static call syntax
Vector.length(&v);
```

This pattern is particularly useful for:

1.  **Calling Parent Methods**: Simulating `super` calls in inheritance (see [Inheritance](13-inheritance.md)).
2.  **Disambiguation**: When multiple methods might have similar names or when dealing with function pointers.

Imported method signatures resolve aliases in their declaring module. The owning
type's generic parameters keep their meaning when selecting instance and static
methods, even when the module defines aliases with the same names.

## Bound Methods

Methods can be assigned to variables. When you access an instance method without calling it, it creates a "bound method" (a `Lambda`) that captures the object instance (`this`).

```bpl
struct Counter {
    val: int,
    frame increment(this: *Counter) {
        this.val = this.val + 1;
    }
}

frame main() {
    local c: Counter = Counter { val: 0 };

    # 'inc' is a Lambda that captures 'c'
    local inc: Lambda<void>() = c.increment;

    inc(); # Calls c.increment(), c.val becomes 1
    inc(); # c.val becomes 2
}
```

The bound method follows reference semantics if the method takes a pointer receiver (`this: *Type`). Modifications via the bound method will affect the original object.
A value receiver (`this: Type`) receives a copy on each invocation, so assigning
its fields does not change the original receiver. Binding retains a reference
to the receiver's storage; later changes to that receiver are visible to later
calls. The binding does not extend the receiver's lifetime. Binding a value
receiver through a null pointer raises `NullAccessError` at binding time.
A receiver expression
such as `make().read` is evaluated once when the method is bound. Variadic value
receiver methods cannot currently be bound; use a non-variadic method signature.

Bindings to generic structs use the concrete owner's method signature. For
example, bindings from `Box<int>` and `Box<long>` retain their respective
instantiations, including when a generic function creates the binding.
