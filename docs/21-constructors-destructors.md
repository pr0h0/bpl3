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

## Destructors

Destructors are methods that clean up resources. BPL does not automatically call destructors; you must call them manually or use a defer mechanism if available.
If you have structs that inherits from other structs, when you call one destructor, others will be called automatically.

```bpl
extern free(ptr: *void);

struct String {
    data: *char,
    len: int,

    frame destroy(this: *String) ret void {
        free(cast<*void>(this.data));
    }
}
```
