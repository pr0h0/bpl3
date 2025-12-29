extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 1;
    local b: bool = cast<bool>(x); # Should be true
    local y: int = cast<int>(b); # Should be 1

    if (b) {
        printf("True\n");
    }
    printf("Val: %d\n", y);

    local z: int = 0;
    local b2: bool = cast<bool>(z);
    if (!b2) {
        printf("False\n");
    }
    return 0;
}
