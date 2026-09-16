extern printf(format: string, ...);
frame main() ret int {
    local pointer: *int = nullptr;
    try {
        *pointer = 42;
    } catch (error: NullAccessError) {
        printf("Caught null store: %d\n", error.code);
        return 0;
    }
    return 1;
}
