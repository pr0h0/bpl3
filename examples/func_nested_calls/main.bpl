extern printf(fmt: string, ...);

frame add(a: int, b: int) ret int {
    return a + b;
}
frame mul(a: int, b: int) ret int {
    return a * b;
}
frame sub(a: int, b: int) ret int {
    return a - b;
}

frame main() ret int {
    # sub(mul(add(1, 2), 3), 4) = ( (1+2)*3 ) - 4 = 9 - 4 = 5
    local res: int = sub(mul(add(1, 2), 3), 4);
    printf("%d\n", res);
    return 0;
}
