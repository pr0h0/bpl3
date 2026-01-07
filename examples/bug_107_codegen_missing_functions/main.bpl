extern printf(fmt: *char, ...) ret int;

frame main() {
    local x: int;
    printf("x = %d\n", x);
}
