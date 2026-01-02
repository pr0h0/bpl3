extern printf(fmt: string, ...);

frame add(a: int, b: int) ret int {
    return a + b;
}

frame subtract(a: int, b: int) ret int {
    return a - b;
}

frame main() {
    local func1: Func<int>(int, int) = add;
    local func2: Func<int>(int, int) = add;
    local func3: Func<int>(int, int) = subtract;

    # Test function pointer equality
    if (func1 == func2) {
        printf("func1 == func2: true\n");
    } else {
        printf("func1 == func2: false\n");
    }

    if (func1 == func3) {
        printf("func1 == func3: true\n");
    } else {
        printf("func1 == func3: false\n");
    }

    if (func1 != func3) {
        printf("func1 != func3: true\n");
    } else {
        printf("func1 != func3: false\n");
    }
}
