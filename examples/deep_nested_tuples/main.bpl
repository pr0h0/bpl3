extern printf(fmt: string, ...);
# Edge case: deeply nested tuple destructuring
frame getDeepNested() ret (((int, int), int), int) {
    return (((1, 2), 3), 4);
}
frame main() ret int {
    # Triple nesting
    local (((a: int, b: int), c: int), d: int) = getDeepNested();
    printf("Triple nested: a=%d, b=%d, c=%d, d=%d\n", a, b, c, d);
    # Construct and destructure in same expression chain
    local deep: (((int, int), int), int) = (((10, 20), 30), 40);
    local (((x: int, y: int), z: int), w: int) = deep;
    printf("Reassigned: x=%d, y=%d, z=%d, w=%d\n", x, y, z, w);
    # Partial destructuring with nested tuples
    local outer: ((int, int), int) = ((5, 6), 7);
    local ((p: int, q: int), r: int) = outer;
    printf("Partial: p=%d, q=%d, r=%d\n", p, q, r);
    return 0;
}
