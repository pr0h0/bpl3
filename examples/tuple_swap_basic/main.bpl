extern printf(fmt: string, ...);
# Basic tuple swap without function
frame main() ret int {
    local x: int = 10;
    local y: int = 20;
    printf("Before swap: x=%d, y=%d\n", x, y);
    (x, y) = (y, x);
    printf("After swap: x=%d, y=%d\n", x, y);
    # Triple rotation
    local a: int = 1;
    local b: int = 2;
    local c: int = 3;
    printf("Before rotation: a=%d, b=%d, c=%d\n", a, b, c);
    (a, b, c) = (c, a, b);
    printf("After rotation: a=%d, b=%d, c=%d\n", a, b, c);
    return 0;
}
