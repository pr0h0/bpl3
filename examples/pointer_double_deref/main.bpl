extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 100;
    local p: *int = &x;
    local pp: **int = &p;

    printf("%d\n", **pp);
    return 0;
}
