extern printf(fmt: string, ...);
# Edge case: ternary with complex boolean expressions
frame main() ret int {
    local x: int = 10;
    local y: int = 20;
    local z: int = 15;
    # De Morgan's laws with ternary
    local result1: int = !(x > y) && (y > z) ? 1 : 0;
    local result2: int = !(x > y) || !(y > z) ? 1 : 0;
    printf("De Morgan result: %d, %d\n", result1, result2);
    # Ternary with short-circuit evaluation
    local a: int = 5;
    local b: int = 0;
    local safe_div: int = (b != 0) && ((a / b) > 0) ? 1 : 0;
    printf("Safe division result: %d\n", safe_div);
    # Chained comparisons with ternary
    local val: int = 50;
    local in_range: bool = (val >= 0) && (val <= 100);
    local msg: string = in_range ? "in range" : "out of range";
    printf("Value %d is %s\n", val, msg);
    # Multiple ternary on same line
    local p: int = 7;
    local q: int = 3;
    local min_val: int = p < q ? p : q;
    local max_val: int = p > q ? p : q;
    printf("min=%d, max=%d\n", min_val, max_val);
    return 0;
}
