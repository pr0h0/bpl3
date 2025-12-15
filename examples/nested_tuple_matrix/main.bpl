extern printf(fmt: string, ...);
# Advanced: nested tuples with functions
frame createMatrix() ret ((int, int), (int, int)) {
    return ((1, 2), (3, 4));
}
frame swapMatrix(mat: ((int, int), (int, int))) ret ((int, int), (int, int)) {
    local ((a: int, b: int), (c: int, d: int)) = mat;
    return ((d, c), (b, a));
}
frame main() ret int {
    local matrix: ((int, int), (int, int)) = createMatrix();
    local ((a: int, b: int), (c: int, d: int)) = matrix;
    printf("Original matrix:\n");
    printf("  [%d, %d]\n", a, b);
    printf("  [%d, %d]\n", c, d);
    local swapped: ((int, int), (int, int)) = swapMatrix(matrix);
    local ((w: int, x: int), (y: int, z: int)) = swapped;
    printf("Swapped matrix:\n");
    printf("  [%d, %d]\n", w, x);
    printf("  [%d, %d]\n", y, z);
    return 0;
}
