# Test arithmetic operator overloading (division, modulo)

import [printf] from "std/c.bpl";

# Rational number (fraction)
struct Rational {
    numerator: int,
    denominator: int,
    # Addition: a/b + c/d = (ad + bc) / bd
    frame __add__(this: *Rational, other: Rational) ret Rational {
        local num: int = (this.numerator * other.denominator) + (other.numerator * this.denominator);
        local den: int = this.denominator * other.denominator;
        local result: Rational = Rational { numerator: num, denominator: den };
        return result;
    }

    # Subtraction: a/b - c/d = (ad - bc) / bd
    frame __sub__(this: *Rational, other: Rational) ret Rational {
        local num: int = (this.numerator * other.denominator) - (other.numerator * this.denominator);
        local den: int = this.denominator * other.denominator;
        local result: Rational = Rational { numerator: num, denominator: den };
        return result;
    }

    # Multiplication: (a/b) * (c/d) = (ac) / (bd)
    frame __mul__(this: *Rational, other: Rational) ret Rational {
        local num: int = this.numerator * other.numerator;
        local den: int = this.denominator * other.denominator;
        local result: Rational = Rational { numerator: num, denominator: den };
        return result;
    }

    # Division: (a/b) / (c/d) = (ad) / (bc)
    frame __div__(this: *Rational, other: Rational) ret Rational {
        local num: int = this.numerator * other.denominator;
        local den: int = this.denominator * other.numerator;
        local result: Rational = Rational { numerator: num, denominator: den };
        return result;
    }

    # Equality
    frame __eq__(this: *Rational, other: Rational) ret bool {
        # Cross multiply: a/b == c/d iff ad == bc
        return (this.numerator * other.denominator) == (other.numerator * this.denominator);
    }

    # Negation: -(a/b) = (-a)/b
    frame __neg__(this: *Rational) ret Rational {
        local result: Rational = Rational { numerator: -this.numerator, denominator: this.denominator };
        return result;
    }

    # Print
    frame print(this: *Rational) {
        printf("%d/%d", this.numerator, this.denominator);
    }
}

# Modular arithmetic
struct ModInt {
    value: int,
    modulus: int,
    # Addition: (a + b) mod m
    frame __add__(this: *ModInt, other: ModInt) ret ModInt {
        local sum: int = (this.value + other.value) % this.modulus;
        local result: ModInt = ModInt { value: sum, modulus: this.modulus };
        return result;
    }

    # Subtraction: (a - b) mod m
    frame __sub__(this: *ModInt, other: ModInt) ret ModInt {
        local diff: int = (this.value - other.value) % this.modulus;
        if (diff < 0) {
            diff = diff + this.modulus;
        }
        local result: ModInt = ModInt { value: diff, modulus: this.modulus };
        return result;
    }

    # Multiplication: (a * b) mod m
    frame __mul__(this: *ModInt, other: ModInt) ret ModInt {
        local prod: int = (this.value * other.value) % this.modulus;
        local result: ModInt = ModInt { value: prod, modulus: this.modulus };
        return result;
    }

    # Modulo: a % b
    frame __mod__(this: *ModInt, other: ModInt) ret ModInt {
        local remainder: int = this.value % other.value;
        local result: ModInt = ModInt { value: remainder, modulus: this.modulus };
        return result;
    }

    # Equality
    frame __eq__(this: *ModInt, other: ModInt) ret bool {
        return (this.value == other.value) && (this.modulus == other.modulus);
    }

    # Print
    frame print(this: *ModInt) {
        printf("%d (mod %d)", this.value, this.modulus);
    }
}

frame main() ret int {
    printf("=== Testing Rational arithmetic ===\n");

    local r1: Rational = Rational { numerator: 1, denominator: 2 }; # 1/2
    local r2: Rational = Rational { numerator: 1, denominator: 3 }; # 1/3
    local r3: Rational = Rational { numerator: 2, denominator: 4 }; # 2/4 = 1/2

    printf("r1 = ");
    r1.print();
    printf("\n");

    printf("r2 = ");
    r2.print();
    printf("\n");

    printf("r3 = ");
    r3.print();
    printf("\n\n");

    # Test addition: 1/2 + 1/3 = 5/6
    local r_add: Rational = r1 + r2;
    printf("r1 + r2 = ");
    r_add.print();
    printf("\n");

    # Test subtraction: 1/2 - 1/3 = 1/6
    local r_sub: Rational = r1 - r2;
    printf("r1 - r2 = ");
    r_sub.print();
    printf("\n");

    # Test multiplication: 1/2 * 1/3 = 1/6
    local r_mul: Rational = r1 * r2;
    printf("r1 * r2 = ");
    r_mul.print();
    printf("\n");

    # Test division: (1/2) / (1/3) = 3/2
    local r_div: Rational = r1 / r2;
    printf("r1 / r2 = ");
    r_div.print();
    printf("\n");

    # Test negation: -(1/2) = -1/2
    local r_neg: Rational = -r1;
    printf("-r1 = ");
    r_neg.print();
    printf("\n");

    # Test equality: 1/2 == 2/4
    if (r1 == r3) {
        printf("r1 == r3: true\n");
    } else {
        printf("r1 == r3: false\n");
    }

    printf("\n=== Testing ModInt arithmetic ===\n");

    local m1: ModInt = ModInt { value: 7, modulus: 10 };
    local m2: ModInt = ModInt { value: 5, modulus: 10 };
    local m3: ModInt = ModInt { value: 12, modulus: 10 };

    printf("m1 = ");
    m1.print();
    printf("\n");

    printf("m2 = ");
    m2.print();
    printf("\n");

    printf("m3 = ");
    m3.print();
    printf("\n\n");

    # Test addition: (7 + 5) mod 10 = 2
    local m_add: ModInt = m1 + m2;
    printf("m1 + m2 = ");
    m_add.print();
    printf("\n");

    # Test subtraction: (7 - 5) mod 10 = 2
    local m_sub: ModInt = m1 - m2;
    printf("m1 - m2 = ");
    m_sub.print();
    printf("\n");

    # Test multiplication: (7 * 5) mod 10 = 5
    local m_mul: ModInt = m1 * m2;
    printf("m1 * m2 = ");
    m_mul.print();
    printf("\n");

    # Test modulo: 7 % 5 = 2
    local m_mod: ModInt = m1 % m2;
    printf("m1 %% m2 = ");
    m_mod.print();
    printf("\n");

    printf("\n=== All tests completed ===\n");

    return 0;
}
