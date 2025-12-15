# math_utils.bpl - Basic math utilities
# This module has no dependencies
export add;
export multiply;
export square;
frame add(a: int, b: int) ret int {
    return a + b;
}
frame multiply(a: int, b: int) ret int {
    return a * b;
}
frame square(x: int) ret int {
    return multiply(x, x);
}
