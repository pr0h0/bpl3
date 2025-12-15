# index.bpl - Math utilities package
export add;
export subtract;
export multiply;
export divide;
export square;
export cube;
frame add(a: int, b: int) ret int {
    return a + b;
}
frame subtract(a: int, b: int) ret int {
    return a - b;
}
frame multiply(a: int, b: int) ret int {
    return a * b;
}
frame divide(a: int, b: int) ret int {
    return a / b;
}
frame square(x: int) ret int {
    return multiply(x, x);
}
frame cube(x: int) ret int {
    return multiply(multiply(x, x), x);
}
