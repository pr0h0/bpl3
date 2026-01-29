# Extended Math Library Test

import [Math], {PI}, {E}, {TAU}, {SQRT2}, {LN2}, {LN10} from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Extended Math Library Test ===\n\n");

    # Test constants
    printf("--- Math Constants ---\n");
    printf("PI = %f\n", PI);
    printf("E = %f\n", E);
    printf("TAU = %f\n", TAU);
    printf("SQRT2 = %f\n", SQRT2);
    printf("LN2 = %f\n", LN2);
    printf("LN10 = %f\n", LN10);

    # Test trigonometric functions
    printf("\n--- Trigonometric Functions ---\n");
    printf("sin(PI/2) = %f\n", Math.sin(PI / 2.0));
    printf("cos(PI) = %f\n", Math.cos(PI));
    printf("tan(PI/4) = %f\n", Math.tan(PI / 4.0));

    # Test inverse trig (approximate)
    printf("\n--- Inverse Trigonometric ---\n");
    printf("atan(1.0) = %f (expected ~0.785)\n", Math.atan(1.0));
    printf("atan2(1.0, 1.0) = %f (expected ~0.785)\n", Math.atan2(1.0, 1.0));

    # Test logarithmic functions
    printf("\n--- Logarithmic Functions ---\n");
    printf("log(E) = %f (expected ~1.0)\n", Math.log(E));
    printf("log10(100) = %f (expected 2.0)\n", Math.log10(100.0));
    printf("log2(8) = %f (expected 3.0)\n", Math.log2(8.0));

    # Test utility functions
    printf("\n--- Utility Functions ---\n");
    printf("clamp(5.0, 0.0, 3.0) = %f\n", Math.clamp(5.0, 0.0, 3.0));
    printf("clamp(-2.0, 0.0, 3.0) = %f\n", Math.clamp(-2.0, 0.0, 3.0));
    printf("clamp(10, 0, 5) = %d\n", Math.clamp(10, 0, 5));
    printf("lerp(0.0, 10.0, 0.5) = %f\n", Math.lerp(0.0, 10.0, 0.5));
    printf("sign(-5.0) = %f\n", Math.sign(-5.0));
    printf("sign(5.0) = %f\n", Math.sign(5.0));
    printf("sign(-10) = %d\n", Math.sign(-10));

    # Test angle conversion
    printf("\n--- Angle Conversion ---\n");
    printf("degToRad(180) = %f (expected ~PI)\n", Math.degToRad(180.0));
    printf("radToDeg(PI) = %f (expected 180)\n", Math.radToDeg(PI));

    # Test power of two functions
    printf("\n--- Power of Two ---\n");
    printf("isPowerOfTwo(8) = %d\n", cast<int>(Math.isPowerOfTwo(8)));
    printf("isPowerOfTwo(7) = %d\n", cast<int>(Math.isPowerOfTwo(7)));
    printf("nextPowerOfTwo(5) = %d\n", Math.nextPowerOfTwo(5));
    printf("nextPowerOfTwo(8) = %d\n", Math.nextPowerOfTwo(8));

    # Test GCD and LCM
    printf("\n--- GCD and LCM ---\n");
    printf("gcd(48, 18) = %d\n", Math.gcd(48, 18));
    printf("lcm(4, 6) = %d\n", Math.lcm(4, 6));

    # Test factorial and fibonacci
    printf("\n--- Factorial and Fibonacci ---\n");
    printf("factorial(5) = %ld\n", Math.factorial(5));
    printf("factorial(10) = %ld\n", Math.factorial(10));
    printf("fibonacci(10) = %ld\n", Math.fibonacci(10));
    printf("fibonacci(20) = %ld\n", Math.fibonacci(20));

    # Test parity
    printf("\n--- Parity ---\n");
    printf("isEven(4) = %d\n", cast<int>(Math.isEven(4)));
    printf("isEven(5) = %d\n", cast<int>(Math.isEven(5)));
    printf("isOdd(7) = %d\n", cast<int>(Math.isOdd(7)));

    printf("\n=== All Math Tests Passed! ===\n");
    return 0;
}
