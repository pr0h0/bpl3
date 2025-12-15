extern printf(fmt: string, ...);
frame max(a: int, b: int) ret int {
    return a > b ? a : b;
}
frame min(a: int, b: int) ret int {
    return a < b ? a : b;
}
frame abs(x: int) ret int {
    return x < 0 ? -x : x;
}
frame getSign(x: int) ret string {
    return x > 0 ? "positive" : x < 0 ? "negative" : "zero";
}
frame main() ret int {
    # Simple ternary
    local a: int = 10;
    local b: int = 20;
    local bigger: int = a > b ? a : b;
    printf("Max of %d and %d is: %d\n", a, b, bigger);
    # Ternary with function
    local maxVal: int = max(15, 25);
    printf("Max(15, 25) = %d\n", maxVal);
    local minVal: int = min(15, 25);
    printf("Min(15, 25) = %d\n", minVal);
    # Nested ternary
    local x: int = 5;
    local category: string = x > 10 ? "high" : x > 5 ? "medium" : "low";
    printf("Category for %d: %s\n", x, category);
    # Ternary with expressions
    local result: int = (a + b) > 25 ? a * 2 : b / 2;
    printf("Result: %d\n", result);
    # Absolute value using ternary
    local neg: int = -42;
    local absVal: int = abs(neg);
    printf("Absolute value of %d is: %d\n", neg, absVal);
    # Sign determination
    local signPos: string = getSign(100);
    local signNeg: string = getSign(-50);
    local signZero: string = getSign(0);
    printf("Sign of 100: %s\n", signPos);
    printf("Sign of -50: %s\n", signNeg);
    printf("Sign of 0: %s\n", signZero);
    # Ternary with boolean
    local isEven: bool = (a % 2) == 0 ? true : false;
    printf("%d is even: %d\n", a, isEven);
    # Complex ternary expression
    local c: int = 30;
    local complex: int = a > b ? b > c ? b : c : a > c ? a : c;
    printf("Complex result: %d\n", complex);
    # Ternary for pointer selection
    local val1: int = 100;
    local val2: int = 200;
    local useFirst: bool = true;
    local selected: *int = useFirst ? &val1 : &val2;
    printf("Selected value: %d\n", *selected);
    return 0;
}
