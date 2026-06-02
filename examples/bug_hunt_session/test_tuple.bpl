# Bug Hunt: Tuple Edge Cases  
import [printf] from "std/c.bpl";

# Test 1: Single element tuple - NOT SUPPORTED
# frame test_single() {
#     local t: (int,) = (42,);  # Single element tuple needs trailing comma?
#     printf("Single: %d\n", t.0);
# }

# Test 2: Nested tuples
frame test_nested() {
    local t: ((int, int), (int, int)) = ((1, 2), (3, 4));
    printf("Nested: (%d, %d), (%d, %d)\n", t.0.0, t.0.1, t.1.0, t.1.1);
}

# Test 3: Tuple with different types
frame test_mixed() {
    local t: (int, float, string, bool) = (42, 3.14, "hello", true);
    printf("Mixed: %d, %f, %s, %d\n", t.0, t.1, t.2, cast<int>(t.3));
}

# Test 4: Tuple destructuring
frame test_destructure() {
    local t: (int, int) = (10, 20);
    local (a: int, b: int) = t;
    printf("Destructured: a=%d, b=%d\n", a, b);
}

# Test 5: Tuple as function return
frame get_pair() ret (int, int) {
    return (100, 200);
}

frame test_return() {
    local (x: int, y: int) = get_pair();
    printf("Returned: x=%d, y=%d\n", x, y);
}

# Test 6: Tuple comparison
frame test_comparison() {
    local t1: (int, int) = (1, 2);
    local t2: (int, int) = (1, 2);
    local t3: (int, int) = (1, 3);

    if (t1 == t2) {
        printf("t1 == t2: true\n");
    } else {
        printf("t1 == t2: false\n");
    }

    if (t1 == t3) {
        printf("t1 == t3: true\n");
    } else {
        printf("t1 == t3: false\n");
    }
}

# Test 7: Tuple as struct field
struct Container {
    pair: (int, string),
}

frame test_struct_field() {
    local c: Container = Container { pair: (42, "answer") };
    printf("Container: %d, %s\n", c.pair.0, c.pair.1);
}

# Test 8: Tuple of tuples assignment
frame test_tuple_assign() {
    local t1: (int, int) = (1, 2);
    local t2: (int, int) = (3, 4);

    # Swap using tuple assignment?
    # (t1, t2) = (t2, t1);  # Does this work?

    # Manual swap
    local tmp: (int, int) = t1;
    t1 = t2;
    t2 = tmp;

    printf("After swap: t1=(%d,%d), t2=(%d,%d)\n", t1.0, t1.1, t2.0, t2.1);
}

# Test 9: Large tuple
frame test_large_tuple() {
    local big: (int, int, int, int, int, int, int, int, int, int) = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    printf("Large tuple: %d...%d\n", big.0, big.9);
}

frame main() {
    # printf("=== Single element ===\n");
    # test_single();  # May not be supported

    printf("=== Nested tuples ===\n");
    test_nested();

    printf("\n=== Mixed types ===\n");
    test_mixed();

    printf("\n=== Destructuring ===\n");
    test_destructure();

    printf("\n=== Function return ===\n");
    test_return();

    printf("\n=== Comparison ===\n");
    test_comparison();

    printf("\n=== Struct field ===\n");
    test_struct_field();

    printf("\n=== Tuple assign ===\n");
    test_tuple_assign();

    printf("\n=== Large tuple ===\n");
    test_large_tuple();

    printf("\nAll tuple tests done\n");
}
