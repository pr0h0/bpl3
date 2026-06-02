import [printf] from "std/c.bpl";

# Homogeneous variadic function
frame sum_integers(args: ...int, count: int) ret int {
    local total: int = 0;
    local i: int = 0;
    loop (i < count) {
        total = total + args[i];
        i = i + 1;
    }
    return total;
}

# Heterogeneous variadic with 'is' operator
frame check_types(args: ...Any, count: int) {
    printf("Checking %d args:\n", count);
    local i: int = 0;
    loop (i < count) {
        local val: Any = args[i];

        # Test 'is' operator on Any
        if (val is int) {
            match (val) {
                int(v) => printf("  Arg %d is int: %d\n", i, v),
                _ => printf("  Arg %d is int (via is) but match failed?\n", i),
            };
        } else if (val is string) {
            match (val) {
                string(s) => printf("  Arg %d is string: %s\n", i, s),
                _ => printf("  Arg %d is string (via is) but match failed?\n", i),
            };
        } else {
            printf("  Arg %d is unknown type\n", i);
        }

        i = i + 1;
    }
}

frame main() {
    # Test 1: Homogeneous
    # We pass 4 arguments. 'count' is automatically populated by the compiler with 4.
    local s: int = sum_integers(1, 2, 3, 4);
    printf("Sum: %d\n", s);

    # Test 2: 'is' operator
    # We pass 3 arguments. 'count' is automatically populated with 3.
    check_types(123, "Test String", 456);
}
