import [printf] from "std/c.bpl";

frame check_generic_is<T>(val: T) {
    if (val is int) {
        printf("Generic val is int\n");
    } else if (val is string) {
        printf("Generic val is string\n");
    } else {
        printf("Generic val is other\n");
    }
}

# Correct signature enforced by compiler
frame process_items<T>(args: ...T, count: int) {
    printf("Processing %d items\n", count);
    local i: int = 0;
    loop (i < count) {
        if (args[i] is int) {
            printf("  Args[%d] is int\n", i);
        } else if (args[i] is string) {
            printf("  Args[%d] is string\n", i);
        } else {
            printf("  Args[%d] is other\n", i);
        }
        i = i + 1;
    }
}

frame main() {
    printf("-- Test 1: Generic<int> --\n");
    check_generic_is<int>(42);

    printf("-- Test 2: Generic<string> --\n");
    check_generic_is<string>("hello");

    printf("-- Test 3: Generic<Any> --\n");
    local i: int = 123;
    local a: Any = cast<Any>(i);
    check_generic_is<Any>(a);

    local s: string = "dynamic string";
    local b: Any = cast<Any>(s);
    check_generic_is<Any>(b);

    printf("-- Test 4: Variadic<int> --\n");
    # args... only. count is injected. Explicit Generic required for now.
    process_items<int>(10, 20, 30);

    printf("-- Test 5: Variadic<Any> --\n");
    # args... only. count is injected. Explicit Generic required.
    process_items<Any>(100, "foo", 200, "bar");
}
