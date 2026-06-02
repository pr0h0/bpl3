# Test nested enums (using nested match expressions as workaround)

import [printf] from "std/c.bpl";

enum Inner {
    Value(int),
    Empty,
}

enum Outer {
    Wrapped(Inner),
    None,
}

frame getValue(outer: Outer) ret int {
    return match (outer) {
        Outer.Wrapped(inner) => match (inner) {
            Inner.Value(v) => v,
            Inner.Empty => 0,
        },
        Outer.None => -1,
    };
}

frame main() ret int {
    local o1: Outer = Outer.Wrapped(Inner.Value(42));
    local o2: Outer = Outer.Wrapped(Inner.Empty);
    local o3: Outer = Outer.None;

    local v1: int = getValue(o1);
    local v2: int = getValue(o2);
    local v3: int = getValue(o3);

    printf("v1: %d, v2: %d, v3: %d\n", v1, v2, v3);

    return v1;
}
