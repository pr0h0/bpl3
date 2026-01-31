# Bug Hunt: Return in Defer
extern printf(fmt: string, ...);

frame test() ret int {
    defer {
        printf("In defer\n");
        return 42; # Should this be allowed?
    }
    printf("After defer setup\n");
    return 0;
}

frame main() {
    local result: int = test();
    printf("Result: %d\n", result);
}
