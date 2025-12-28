extern printf(fmt: string, ...);

type Printer = Lambda<void>();

frame main() ret int {
    local x: int = 10;

    local p: Printer = || {
        printf("Captured: %d\n", x);
    };

    x = 20; # Should not affect the captured value if captured by value

    p();
    printf("Outer: %d\n", x);
    return 0;
}
