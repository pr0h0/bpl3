extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 5;
    local b: int = 10;
    local c: bool = true;

    if (((a < b) && c) || (a > b)) {
        printf("Condition 1 met\n");
    }
    if (!(a == b)) {
        printf("Condition 2 met\n");
    }
    return 0;
}
