import [printf] from "std/c.bpl";

frame identity<T>(val: T) ret T {
    return val;
}

frame add<T>(a: T, b: T) ret T {
    return a + b;
}

frame main() {
    # Explicit calls required because inference is disabled
    local x: int = identity<int>(42);
    printf("Identity: %d\n", x);

    local y: int = add<int>(10, 20);
    printf("Add: %d\n", y);
}
