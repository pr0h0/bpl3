extern printf(fmt: *char, ...) ret int;

frame main() {
    local x: int = 0;
    printf("x = %d\n", x);
}
