# Bug Hunt: Operator Edge Cases
extern printf(fmt: string, ...);

frame main() {
    # Test integer overflow
    local maxInt: int = 2147483647;
    local overflow: int = maxInt + 1;
    printf("maxInt + 1 = %d\n", overflow);

    # Test underflow
    local minInt: int = -2147483648;
    local underflow: int = minInt - 1;
    printf("minInt - 1 = %d\n", underflow);

    # Test multiply overflow
    local bigMul: int = 1000000 * 1000000;
    printf("1000000 * 1000000 = %d\n", bigMul);

    # Test very large left shift
    local bigShift: int = 1 << 31;
    printf("1 << 31 = %d\n", bigShift);

    # Test negative shift
    # local negShift: int = 1 << -1;  # This might crash

    # Test bitwise on negative numbers
    local negAnd: int = -1 & 0xFF;
    printf("-1 & 0xFF = %d\n", negAnd);

    # Test unary plus
    local pos: int = +5;
    printf("+5 = %d\n", pos);

    # Test double negation
    local doubleNeg: int = --5; # This is decrement, not double negation
    printf("--5 = %d\n", doubleNeg);

    # Test increment/decrement on literal (should fail)
    # 5++;  # Should be compile error
}
