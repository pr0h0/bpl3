extern printf(fmt: string, ...) ret int;

frame print_val(i: int) {
    printf("int: %d\n", i);
}

frame print_val(d: double) {
    printf("double: %f\n", d);
}

frame print_val(b: bool) {
    if (b) {
        printf("bool: true\n");
    } else {
        printf("bool: false\n");
    }
}

frame add(a: int, b: int) ret int {
    return a + b;
}

frame add(a: int, b: int, c: int) ret int {
    return a + b + c;
}

frame main() {
    print_val(42);
    print_val(3.14);
    print_val(true);

    local sum2: int = add(10, 20);
    printf("sum2: %d\n", sum2);

    local sum3: int = add(10, 20, 30);
    printf("sum3: %d\n", sum3);
}
