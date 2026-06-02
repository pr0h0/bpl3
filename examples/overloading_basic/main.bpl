import [printf] from "std/c.bpl";

frame printVal(i: int) {
    printf("int: %d\n", i);
}

frame printVal(d: double) {
    printf("double: %f\n", d);
}

frame printVal(b: bool) {
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
    printVal(42);
    printVal(3.14);
    printVal(true);

    local sum2: int = add(10, 20);
    printf("sum2: %d\n", sum2);

    local sum3: int = add(10, 20, 30);
    printf("sum3: %d\n", sum3);
}
