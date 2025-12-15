extern printf(fmt: string, ...);
frame createTuple() ret (int, float, bool) {
    return (42, 3.14, true);
}
frame swapValues(a: int, b: int) ret (int, int) {
    return (b, a);
}
frame nestedTuple() ret ((int, int), (float, float)) {
    return ((10, 20), (1.5, 2.5));
}
frame main() ret int {
    # Basic tuple creation and destructuring
    local (x: int, y: float, z: bool) = createTuple();
    printf("x=%d, y=%.2f, z=%d\n", x, y, z);
    # Tuple swap
    local a: int = 5;
    local b: int = 10;
    printf("Before swap: a=%d, b=%d\n", a, b);
    (a, b) = swapValues(a, b);
    printf("After swap: a=%d, b=%d\n", a, b);
    # Direct tuple swap
    local m: int = 100;
    local n: int = 200;
    printf("Before direct swap: m=%d, n=%d\n", m, n);
    (m, n) = (n, m);
    printf("After direct swap: m=%d, n=%d\n", m, n);
    # Nested tuple
    local ((p: int, q: int), (r: float, s: float)) = nestedTuple();
    printf("Nested: p=%d, q=%d, r=%.1f, s=%.1f\n", p, q, r, s);
    # Tuple type alias
    local point: (int, int) = (100, 200);
    local (px: int, py: int) = point;
    printf("Point: px=%d, py=%d\n", px, py);
    return 0;
}
