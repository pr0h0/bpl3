extern printf(fmt: string, ...);
frame main() ret int {
    local x: int = 42;
    local ptr: *int = &x;
    printf("Value: %d\n", *ptr);
    *ptr = 100;
    printf("New Value: %d\n", x);
    return 0;
}
