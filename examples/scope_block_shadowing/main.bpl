extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    if (true) {
        local x: int = 20;
        printf("Inner: %d\n", x);
    }
    printf("Outer: %d\n", x);
    return 0;
}
