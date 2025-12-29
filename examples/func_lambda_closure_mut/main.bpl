extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    local f: Lambda<void>() = || ret void {
        x = x + 1;
    };
    f();
    f();
    printf("%d\n", x);
    return 0;
}
