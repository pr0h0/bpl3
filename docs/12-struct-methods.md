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
