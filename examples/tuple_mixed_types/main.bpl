extern printf(fmt: string, ...);
# Edge case: tuples with mixed types including floats
frame getMixedTuple() ret (int, float, bool, string) {
    return (42, 3.14, true, "hello");
}
frame main() ret int {
    # Mixed type tuple
    local (num: int, pi: float, flag: bool, msg: string) = getMixedTuple();
    printf("Mixed: num=%d, pi=%.2f, flag=%d, msg=%s\n", num, pi, flag, msg);
    # Tuple with float operations
    local point: (float, float) = (1.5, 2.5);
    local (px: float, py: float) = point;
    local distance: float = (px * px) + (py * py);
    printf("Distance squared: %.2f\n", distance);
    # Reassign mixed tuple
    (num, pi, flag, msg) = (100, 2.71, false, "world");
    printf("Updated: num=%d, pi=%.2f, flag=%d, msg=%s\n", num, pi, flag, msg);
    # Nested with mixed types
    local complex: ((int, float), string) = ((7, 1.41), "test");
    local ((a: int, b: float), s: string) = complex;
    printf("Complex: a=%d, b=%.2f, s=%s\n", a, b, s);
    return 0;
}
