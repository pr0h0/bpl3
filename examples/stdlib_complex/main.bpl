# Complex Number Test Example

import [Complex] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Complex Number Test ===\n\n");

    # Basic creation
    printf("--- Creation ---\n");
    local c1: Complex = Complex.new(3.0, 4.0);
    printf("c1 = 3 + 4i\n");
    printf("  real: %.2f, imag: %.2f\n", c1.real, c1.imag);

    local c2: Complex = Complex.new(1.0, 2.0);
    printf("c2 = 1 + 2i\n");

    local cReal: Complex = Complex.fromReal(5.0);
    printf("fromReal(5): %.2f + %.2fi\n", cReal.real, cReal.imag);

    local cImag: Complex = Complex.fromImag(3.0);
    printf("fromImag(3): %.2f + %.2fi\n", cImag.real, cImag.imag);

    # Arithmetic
    printf("\n--- Arithmetic ---\n");
    local sum: Complex = c1.add(c2);
    printf("c1 + c2 = %.2f + %.2fi\n", sum.real, sum.imag);

    local diff: Complex = c1.sub(c2);
    printf("c1 - c2 = %.2f + %.2fi\n", diff.real, diff.imag);

    local prod: Complex = c1.mul(c2);
    printf("c1 * c2 = %.2f + %.2fi\n", prod.real, prod.imag);

    local quot: Complex = c1.div(c2);
    printf("c1 / c2 = %.2f + %.2fi\n", quot.real, quot.imag);

    local scaled: Complex = c1.scale(2.0);
    printf("c1 * 2 = %.2f + %.2fi\n", scaled.real, scaled.imag);

    # Magnitude and phase
    printf("\n--- Magnitude & Phase ---\n");
    printf("c1 = 3 + 4i\n");
    printf("|c1| = %.4f\n", c1.abs());
    printf("|c1|^2 = %.4f\n", c1.absSquared());
    printf("phase(c1) = %.4f radians\n", c1.phase());

    # Conjugate and negation
    printf("\n--- Conjugate & Negation ---\n");
    local conj: Complex = c1.conjugate();
    printf("conjugate(c1) = %.2f + %.2fi\n", conj.real, conj.imag);

    local neg: Complex = c1.negate();
    printf("-c1 = %.2f + %.2fi\n", neg.real, neg.imag);

    # Reciprocal
    printf("\n--- Reciprocal ---\n");
    local recip: Complex = c1.reciprocal();
    printf("1/c1 = %.4f + %.4fi\n", recip.real, recip.imag);
    local check: Complex = c1.mul(recip);
    printf("c1 * (1/c1) = %.4f + %.4fi (should be 1+0i)\n", check.real, check.imag);

    # Powers
    printf("\n--- Powers ---\n");
    local squared: Complex = c1.pow(2);
    printf("c1^2 = %.2f + %.2fi\n", squared.real, squared.imag);

    local cubed: Complex = c1.pow(3);
    printf("c1^3 = %.2f + %.2fi\n", cubed.real, cubed.imag);

    local inverse: Complex = c1.pow(-1);
    printf("c1^(-1) = %.4f + %.4fi\n", inverse.real, inverse.imag);

    # Square root
    printf("\n--- Square Root ---\n");
    local sqrtC: Complex = c1.sqrt();
    printf("sqrt(c1) = %.4f + %.4fi\n", sqrtC.real, sqrtC.imag);
    local sqrtCheck: Complex = sqrtC.mul(sqrtC);
    printf("sqrt(c1)^2 = %.4f + %.4fi (should be c1)\n", sqrtCheck.real, sqrtCheck.imag);

    # Exponential and logarithm
    printf("\n--- Exp & Log ---\n");
    local small: Complex = Complex.new(1.0, 0.0);
    local expC: Complex = small.exp();
    printf("exp(1+0i) = %.4f + %.4fi (e = 2.7183)\n", expC.real, expC.imag);

    local logC: Complex = expC.log();
    printf("log(e) = %.4f + %.4fi (should be 1+0i)\n", logC.real, logC.imag);

    # Trigonometric
    printf("\n--- Trigonometric ---\n");
    local zero: Complex = Complex.zero();
    local sinZero: Complex = zero.sin();
    printf("sin(0) = %.4f + %.4fi\n", sinZero.real, sinZero.imag);

    local cosZero: Complex = zero.cos();
    printf("cos(0) = %.4f + %.4fi\n", cosZero.real, cosZero.imag);

    # Polar form
    printf("\n--- Polar Form ---\n");
    local polar: Complex = Complex.fromPolar(5.0, 0.9273); # ~53 degrees
    printf("fromPolar(5, 0.9273) = %.4f + %.4fi\n", polar.real, polar.imag);

    # Special values
    printf("\n--- Special Values ---\n");
    local i: Complex = Complex.i();
    printf("i = %.2f + %.2fi\n", i.real, i.imag);

    local iSquared: Complex = i.mul(i);
    printf("i^2 = %.2f + %.2fi (should be -1+0i)\n", iSquared.real, iSquared.imag);

    # Comparisons
    printf("\n--- Comparisons ---\n");
    local a: Complex = Complex.new(1.0, 2.0);
    local b: Complex = Complex.new(1.0, 2.0);
    local c: Complex = Complex.new(1.0, 3.0);
    printf("(1+2i) equals (1+2i): %d\n", cast<int>(a.equals(&b)));
    printf("(1+2i) equals (1+3i): %d\n", cast<int>(a.equals(&c)));
    printf("c1 is real: %d\n", cast<int>(c1.isReal()));
    printf("cReal is real: %d\n", cast<int>(cReal.isReal()));
    printf("cImag is imaginary: %d\n", cast<int>(cImag.isImaginary()));

    printf("\n=== Complex Number Test Complete ===\n");
    return 0;
}
