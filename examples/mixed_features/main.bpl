extern printf(fmt: string, ...);
# Mixing tuples, ternary, and boolean operators
frame getRange(x: int) ret (int, int) {
    local lower: int = x < 50 ? 0 : 50;
    local upper: int = x < 50 ? 50 : 100;
    return (lower, upper);
}
frame main() ret int {
    local value: int = 25;
    local (min: int, max: int) = getRange(value);
    printf("Value %d is in range [%d, %d]\n", value, min, max);
    # Boolean short-circuit with tuple result
    local flag: bool = true;
    local result: int = flag && (value < 30) ? 1 : 0;
    printf("Result: %d\n", result);
    # Ternary selecting between tuples
    local coords: (int, int) = value > 50 ? (100, 200) : (10, 20);
    local (cx: int, cy: int) = coords;
    printf("Coordinates: (%d, %d)\n", cx, cy);
    # Complex: tuple swap with ternary condition
    local a: int = 5;
    local b: int = 15;
    if (a > b) {
        (a, b) = (b, a);
    }
    printf("Ordered: a=%d, b=%d\n", a, b);
    return 0;
}
