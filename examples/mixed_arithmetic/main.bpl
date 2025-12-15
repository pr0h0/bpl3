extern printf(fmt: string, ...);
frame testIntFloatMix() {
    printf("Testing int and float mixing:\n");
    local i: int = 10;
    local f: float = 3.5;
    # Int with float
    local result1: float = cast<float>(i) + f;
    printf("%d + %.1f = %.1f\n", i, f, result1);
    local result2: float = cast<float>(i) * f;
    printf("%d * %.1f = %.1f\n", i, f, result2);
    # Float to int conversion
    local result3: int = cast<int>(f);
    printf("(int)%.1f = %d\n", f, result3);
}
frame testUintIntMix() {
    printf("\nTesting uint and int mixing:\n");
    local u: uint = 100;
    local i: int = 50;
    local result1: uint = u + cast<uint>(i);
    printf("%lu + %d = %lu\n", u, i, result1);
    local result2: uint = u - cast<uint>(i);
    printf("%lu - %d = %lu\n", u, i, result2);
}
frame testAllTypeMix() {
    printf("\nTesting all type mixing:\n");
    local i: int = 10;
    local u: uint = 20;
    local f: float = 1.5;
    local result1: float = cast<float>(i) + cast<float>(u) + f;
    printf("int(%d) + uint(%lu) + float(%.1f) = %.1f\n", i, u, f, result1);
    # Complex expression
    local complex: float = (cast<float>(i) * f) + cast<float>(u);
    printf("(int(%d) * float(%.1f)) + uint(%lu) = %.1f\n", i, f, u, complex);
}
frame testCharArithmetic() {
    printf("\nTesting char arithmetic:\n");
    local c: char = cast<char>(65); # 'A'
    printf("char value: %c (ASCII)\n", c);
    local c2: char = cast<char>(cast<int>(c) + 1); # 'B'
    printf("char + 1: %c (ASCII)\n", c2);
    # Char to int
    local charAsInt: int = cast<int>(c);
    printf("char as int: %d\n", charAsInt);
}
frame testBoolArithmetic() {
    printf("\nTesting bool in expressions:\n");
    local b1: bool = true;
    local b2: bool = false;
    local boolAsInt1: int = b1;
    local boolAsInt2: int = b2;
    printf("true as int: %d\n", boolAsInt1);
    printf("false as int: %d\n", boolAsInt2);
    # Bool in arithmetic
    local sum: int = b1 + b2;
    printf("true + false = %d\n", sum);
}
frame testDivisionTypes() {
    printf("\nTesting division with different types:\n");
    # Integer division
    local intDiv: int = 10 / 3;
    printf("10 / 3 (int) = %d\n", intDiv);
    # Float division
    local floatDiv: float = 10.0 / 3.0;
    printf("10.0 / 3.0 (float) = %.2f\n", floatDiv);
    # Mixed division
    local mixedDiv: float = cast<float>(10) / 3.0;
    printf("(float)10 / 3.0 = %.2f\n", mixedDiv);
}
frame testOverflowAndUnderflow() {
    printf("\nTesting overflow and underflow:\n");
    # Large int
    local maxInt: int = 2147483647;
    printf("Max int: %d\n", maxInt);
    # Large uint
    local largeUint: uint = 4294967295;
    printf("Large uint: %lu\n", largeUint);
    # Float precision
    local tiny: float = 0.000001;
    local large: float = 1000000.0;
    local product: float = tiny * large;
    printf("%.6f * %.1f = %.1f\n", tiny, large, product);
}
frame testNegativeNumbers() {
    printf("\nTesting negative numbers:\n");
    local neg: int = -42;
    local pos: int = 10;
    local sum: int = neg + pos;
    printf("%d + %d = %d\n", neg, pos, sum);
    local product: int = neg * pos;
    printf("%d * %d = %d\n", neg, pos, product);
    # Negative to unsigned
    local asUint: uint = cast<uint>(neg);
    printf("(uint)%d = %lu\n", neg, asUint);
}
frame main() ret int {
    testIntFloatMix();
    testUintIntMix();
    testAllTypeMix();
    testCharArithmetic();
    testBoolArithmetic();
    testDivisionTypes();
    testOverflowAndUnderflow();
    testNegativeNumbers();
    # Complex mixed expression
    printf("\nComplex mixed type expression:\n");
    local a: int = 5;
    local b: float = 2.5;
    local c: uint = 3;
    local result: float = (cast<float>(a) * b) + cast<float>(c);
    printf("(int(5) * float(2.5)) + uint(3) = %.1f\n", result);
    return 0;
}
