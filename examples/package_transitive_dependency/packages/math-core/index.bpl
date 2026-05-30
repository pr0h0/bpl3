export add;
export triple;

frame add(a: int, b: int) ret int {
    return a + b;
}

frame triple(value: int) ret int {
    return value * 3;
}
