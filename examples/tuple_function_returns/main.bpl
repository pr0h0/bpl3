extern printf(fmt: string, ...);
frame getTuple() ret (int, int, int) {
    return (100, 200, 300);
}
frame processValues(a: int, b: int, c: int) ret int {
    return a + b + c;
}
frame main() ret int {
    # Destructure directly from function
    local (x: int, y: int, z: int) = getTuple();
    printf("Values: x=%d, y=%d, z=%d\n", x, y, z);
    # Use destructured values
    local sum: int = processValues(x, y, z);
    printf("Sum: %d\n", sum);
    # Reassign via tuple
    (x, y, z) = (z, x, y);
    printf("After rotation: x=%d, y=%d, z=%d\n", x, y, z);
    return 0;
}
