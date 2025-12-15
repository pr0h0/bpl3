extern printf(fmt: string, ...);
# Test floating point edge cases and operations
frame test_float_arithmetic() {
    printf("=== Float Arithmetic ===\n");
    local a: float = 10.5;
    local b: float = 3.2;
    local sum: float = a + b;
    local diff: float = a - b;
    local prod: float = a * b;
    local quot: float = a / b;
    printf("%.2f + %.2f = %.2f\n", a, b, sum);
    printf("%.2f - %.2f = %.2f\n", a, b, diff);
    printf("%.2f * %.2f = %.2f\n", a, b, prod);
    printf("%.2f / %.2f = %.2f\n", a, b, quot);
}
frame test_float_comparisons() {
    printf("\n=== Float Comparisons ===\n");
    local x: float = 5.5;
    local y: float = 5.5;
    local z: float = 3.3;
    if (x == y) {
        printf("%.2f == %.2f: true\n", x, y);
    }
    if (x != z) {
        printf("%.2f != %.2f: true\n", x, z);
    }
    if (x > z) {
        printf("%.2f > %.2f: true\n", x, z);
    }
    if (z < x) {
        printf("%.2f < %.2f: true\n", z, x);
    }
}
frame test_double_precision() {
    printf("\n=== Double Precision ===\n");
    local pi: double = 3.14159265359;
    local e: double = 2.71828182846;
    local result: double = pi * e;
    printf("pi = %.10f\n", pi);
    printf("e = %.10f\n", e);
    printf("pi * e = %.10f\n", result);
}
frame test_mixed_operations() {
    printf("\n=== Mixed Int/Float Operations ===\n");
    local int_val: int = 10;
    local float_val: float = 3.5;
    # Cast int to float for division
    local float_int: float = cast<float>(int_val);
    local result: float = float_int / float_val;
    printf("%d as float = %.2f\n", int_val, float_int);
    printf("%.2f / %.2f = %.2f\n", float_int, float_val, result);
}
frame main() ret int {
    test_float_arithmetic();
    test_float_comparisons();
    test_double_precision();
    test_mixed_operations();
    return 0;
}
