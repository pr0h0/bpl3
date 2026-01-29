# Rational Number Test Example

import [Rational] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Rational Number Test ===\n\n");

    # Basic creation
    printf("--- Creation ---\n");
    local r1: Rational = Rational.new(3, 4);
    printf("r1 = 3/4 = %d/%d\n", r1.num, r1.den);

    local r2: Rational = Rational.new(2, 5);
    printf("r2 = 2/5 = %d/%d\n", r2.num, r2.den);

    local rInt: Rational = Rational.fromInt(5);
    printf("fromInt(5) = %d/%d\n", rInt.num, rInt.den);

    # Auto-simplification
    printf("\n--- Auto-Simplification ---\n");
    local r3: Rational = Rational.new(6, 8);
    printf("6/8 simplified = %d/%d\n", r3.num, r3.den);

    local r4: Rational = Rational.new(12, 18);
    printf("12/18 simplified = %d/%d\n", r4.num, r4.den);

    local r5: Rational = Rational.new(100, 25);
    printf("100/25 simplified = %d/%d\n", r5.num, r5.den);

    # Negative handling
    printf("\n--- Negative Numbers ---\n");
    local negNum: Rational = Rational.new(-3, 4);
    printf("-3/4 = %d/%d\n", negNum.num, negNum.den);

    local negDen: Rational = Rational.new(3, -4);
    printf("3/-4 = %d/%d (normalized)\n", negDen.num, negDen.den);

    local negBoth: Rational = Rational.new(-3, -4);
    printf("-3/-4 = %d/%d (normalized)\n", negBoth.num, negBoth.den);

    # Arithmetic
    printf("\n--- Arithmetic ---\n");
    local sum: Rational = r1.add(r2);
    printf("3/4 + 2/5 = %d/%d\n", sum.num, sum.den);

    local diff: Rational = r1.sub(r2);
    printf("3/4 - 2/5 = %d/%d\n", diff.num, diff.den);

    local prod: Rational = r1.mul(r2);
    printf("3/4 * 2/5 = %d/%d\n", prod.num, prod.den);

    local quot: Rational = r1.div(r2);
    printf("3/4 / 2/5 = %d/%d\n", quot.num, quot.den);

    # Reciprocal
    printf("\n--- Reciprocal ---\n");
    local recip: Rational = r1.reciprocal();
    printf("reciprocal(3/4) = %d/%d\n", recip.num, recip.den);

    # Power
    printf("\n--- Power ---\n");
    local half: Rational = Rational.new(1, 2);
    local squared: Rational = half.pow(2);
    printf("(1/2)^2 = %d/%d\n", squared.num, squared.den);

    local cubed: Rational = half.pow(3);
    printf("(1/2)^3 = %d/%d\n", cubed.num, cubed.den);

    local fourth: Rational = half.pow(4);
    printf("(1/2)^4 = %d/%d\n", fourth.num, fourth.den);

    local inverse: Rational = half.pow(-1);
    printf("(1/2)^(-1) = %d/%d\n", inverse.num, inverse.den);

    # Conversion to float
    printf("\n--- Float Conversion ---\n");
    printf("3/4 as float = %.4f\n", r1.toFloat());
    printf("2/5 as float = %.4f\n", r2.toFloat());
    printf("1/3 as float = %.4f\n", Rational.new(1, 3).toFloat());

    # Floor, Ceil, Round
    printf("\n--- Floor, Ceil, Round ---\n");
    local r6: Rational = Rational.new(7, 3);
    printf("7/3 = %.4f\n", r6.toFloat());
    printf("floor(7/3) = %d\n", r6.floor());
    printf("ceil(7/3) = %d\n", r6.ceil());
    printf("round(7/3) = %d\n", r6.round());

    local r7: Rational = Rational.new(5, 2);
    printf("\n5/2 = %.4f\n", r7.toFloat());
    printf("floor(5/2) = %d\n", r7.floor());
    printf("ceil(5/2) = %d\n", r7.ceil());
    printf("round(5/2) = %d\n", r7.round());

    local r8: Rational = Rational.new(-7, 3);
    printf("\n-7/3 = %.4f\n", r8.toFloat());
    printf("floor(-7/3) = %d\n", r8.floor());
    printf("ceil(-7/3) = %d\n", r8.ceil());
    printf("round(-7/3) = %d\n", r8.round());

    # Negation and Absolute
    printf("\n--- Negation & Absolute ---\n");
    local neg: Rational = r1.negate();
    printf("-3/4 = %d/%d\n", neg.num, neg.den);

    local absNeg: Rational = neg.abs();
    printf("|-3/4| = %d/%d\n", absNeg.num, absNeg.den);

    # Sign
    printf("\n--- Sign ---\n");
    printf("sign(3/4) = %d\n", r1.sign());
    printf("sign(-3/4) = %d\n", neg.sign());
    printf("sign(0/1) = %d\n", Rational.zero().sign());

    # Comparisons
    printf("\n--- Comparisons ---\n");
    local a: Rational = Rational.new(1, 2);
    local b: Rational = Rational.new(2, 4);
    local c: Rational = Rational.new(2, 3);
    printf("1/2 equals 2/4: %d\n", cast<int>(a.equals(&b)));
    printf("1/2 equals 2/3: %d\n", cast<int>(a.equals(&c)));
    printf("1/2 < 2/3: %d\n", cast<int>(a.lessThan(&c)));
    printf("2/3 < 1/2: %d\n", cast<int>(c.lessThan(&a)));
    printf("1/2 <= 2/4: %d\n", cast<int>(a.lessEqual(&b)));
    printf("1/2 > 2/3: %d\n", cast<int>(a.greaterThan(&c)));

    # Special values
    printf("\n--- Special Values ---\n");
    local z: Rational = Rational.zero();
    printf("zero = %d/%d\n", z.num, z.den);

    local o: Rational = Rational.one();
    printf("one = %d/%d\n", o.num, o.den);

    printf("3/4 isZero: %d\n", cast<int>(r1.isZero()));
    printf("0/1 isZero: %d\n", cast<int>(z.isZero()));
    printf("4/1 isInteger: %d\n", cast<int>(Rational.new(4, 1).isInteger()));
    printf("3/4 isInteger: %d\n", cast<int>(r1.isInteger()));
    printf("3/4 isPositive: %d\n", cast<int>(r1.isPositive()));
    printf("-3/4 isNegative: %d\n", cast<int>(neg.isNegative()));

    # GCD utility
    printf("\n--- GCD ---\n");
    printf("gcd(12, 8) = %d\n", Rational.gcd(12, 8));
    printf("gcd(48, 18) = %d\n", Rational.gcd(48, 18));
    printf("gcd(7, 13) = %d\n", Rational.gcd(7, 13));

    printf("\n=== Rational Number Test Complete ===\n");
    return 0;
}
