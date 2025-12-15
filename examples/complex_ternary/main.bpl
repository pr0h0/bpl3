extern printf(fmt: string, ...);
# Complex ternary operator combinations
frame classify(x: int, y: int) ret string {
    return x > y ? x > 50 ? "large positive" : "small positive" : x < y ? y > 50 ? "large negative" : "small negative" : "equal";
}
frame main() ret int {
    # Deeply nested ternary
    local a: int = 15;
    local b: int = 30;
    local result: string = classify(a, b);
    printf("classify(%d, %d) = %s\n", a, b, result);
    # Ternary with boolean combinations
    local age: int = 20;
    local hasLicense: bool = true;
    local canDrive: bool = (age >= 18) && hasLicense;
    local status: string = canDrive ? "Can drive" : "Cannot drive";
    printf("%s\n", status);
    # Ternary in ternary
    local x: int = 100;
    local category: string = x < 0 ? "negative" : x == 0 ? "zero" : x < 100 ? "small" : "large";
    printf("Number %d is %s\n", x, category);
    # Ternary with arithmetic
    local p: int = 7;
    local q: int = 3;
    local max_times_two: int = (p > q ? p : q) * 2;
    printf("Max times two: %d\n", max_times_two);
    return 0;
}
