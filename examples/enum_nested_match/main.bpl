# Nested match expressions with enums
# Demonstrates workaround for nested pattern matching using nested match expressions

import [printf] from "std/c.bpl";

enum Inner {
    Value(int),
    Empty,
}

enum Outer {
    Wrapped(Inner),
    None,
}

enum Status {
    Ok(int),
    Warning(int),
    Error(int),
}

frame unwrapNested(outer: Outer) ret int {
    # Workaround for nested patterns: use nested match expressions
    # Instead of: Outer.Wrapped(Inner.Value(v)) => v
    # We use: Outer.Wrapped(inner) => match (inner) { Inner.Value(v) => v }
    return match (outer) {
        Outer.Wrapped(inner) => match (inner) {
            Inner.Value(v) => v,
            Inner.Empty => 0,
        },
        Outer.None => -1,
    };
}

frame processStatus(s: Status) ret int {
    return match (s) {
        Status.Ok(code) => code,
        Status.Warning(code) => code + 100,
        Status.Error(code) => code + 200,
    };
}

frame combineNested(o1: Outer, o2: Outer, s: Status) ret int {
    local v1: int = unwrapNested(o1);
    local v2: int = unwrapNested(o2);
    local status_val: int = processStatus(s);

    printf("v1: %d, v2: %d, status: %d\n", v1, v2, status_val);

    return v1 + v2 + status_val;
}

frame main() ret int {
    # Test nested enum unwrapping
    local inner1: Inner = Inner.Value(42);
    local outer1: Outer = Outer.Wrapped(inner1);

    local inner2: Inner = Inner.Empty;
    local outer2: Outer = Outer.Wrapped(inner2);

    local outer3: Outer = Outer.None;

    # Test status matching
    local status: Status = Status.Warning(5);

    printf("Test 1 - Wrapped(Value(42)): %d\n", unwrapNested(outer1));
    printf("Test 2 - Wrapped(Empty): %d\n", unwrapNested(outer2));
    printf("Test 3 - None: %d\n", unwrapNested(outer3));
    printf("Test 4 - Warning(5): %d\n", processStatus(status));

    # Combined test: 42 + 0 + 105 = 147
    local result: int = combineNested(outer1, outer2, status);
    printf("Combined result: %d\n", result);

    return result;
}
