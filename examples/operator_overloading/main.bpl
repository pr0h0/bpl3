# Test operator overloading

import [printf] from "std/c.bpl";

# Vector2D with operator overloading
struct Vector2D {
    x: float,
    y: float,
    # Addition operator: v1 + v2
    frame __add__(this: *Vector2D, other: Vector2D) ret Vector2D {
        local result: Vector2D = Vector2D { x: this.x + other.x, y: this.y + other.y };
        return result;
    }

    # Subtraction operator: v1 - v2
    frame __sub__(this: *Vector2D, other: Vector2D) ret Vector2D {
        local result: Vector2D = Vector2D { x: this.x - other.x, y: this.y - other.y };
        return result;
    }

    # Multiplication by scalar: v * scalar
    frame __mul__(this: *Vector2D, scalar: float) ret Vector2D {
        local result: Vector2D = Vector2D { x: this.x * scalar, y: this.y * scalar };
        return result;
    }

    # Negation operator: -v
    frame __neg__(this: *Vector2D) ret Vector2D {
        local result: Vector2D = Vector2D { x: -this.x, y: -this.y };
        return result;
    }

    # Equality operator: v1 == v2
    frame __eq__(this: *Vector2D, other: Vector2D) ret bool {
        return (this.x == other.x) && (this.y == other.y);
    }

    # Print vector
    frame print(this: *Vector2D) {
        printf("Vector2D(%.2f, %.2f)", this.x, this.y);
    }
}

# Complex number with operator overloading
struct Complex {
    real: float,
    imag: float,
    # Addition: c1 + c2
    frame __add__(this: *Complex, other: Complex) ret Complex {
        local result: Complex = Complex { real: this.real + other.real, imag: this.imag + other.imag };
        return result;
    }

    # Multiplication: c1 * c2
    frame __mul__(this: *Complex, other: Complex) ret Complex {
        # (a+bi) * (c+di) = (ac-bd) + (ad+bc)i
        local r: float = (this.real * other.real) - (this.imag * other.imag);
        local i: float = (this.real * other.imag) + (this.imag * other.real);
        local result: Complex = Complex { real: r, imag: i };
        return result;
    }

    # Equality: c1 == c2
    frame __eq__(this: *Complex, other: Complex) ret bool {
        return (this.real == other.real) && (this.imag == other.imag);
    }

    # Print complex number
    frame print(this: *Complex) {
        if (this.imag >= 0.0) {
            printf("%.2f + %.2fi", this.real, this.imag);
        } else {
            printf("%.2f - %.2fi", this.real, -this.imag);
        }
    }
}

# Callable struct - function object
struct Multiplier {
    factor: float,
    # Call operator: m(value)
    frame __call__(this: *Multiplier, value: float) ret float {
        return this.factor * value;
    }
}

frame main() ret int {
    printf("=== Testing Vector2D operators ===\n");

    local v1: Vector2D = Vector2D { x: 3.0, y: 4.0 };
    local v2: Vector2D = Vector2D { x: 1.0, y: 2.0 };

    printf("v1 = ");
    v1.print();
    printf("\n");

    printf("v2 = ");
    v2.print();
    printf("\n");

    # Test addition
    local v_add: Vector2D = v1 + v2;
    printf("v1 + v2 = ");
    v_add.print();
    printf("\n");

    # Test subtraction
    local v_sub: Vector2D = v1 - v2;
    printf("v1 - v2 = ");
    v_sub.print();
    printf("\n");

    # Test multiplication
    local v_mul: Vector2D = v1 * 2.0;
    printf("v1 * 2.0 = ");
    v_mul.print();
    printf("\n");

    # Test negation
    local v_neg: Vector2D = -v1;
    printf("-v1 = ");
    v_neg.print();
    printf("\n");

    # Test equality
    local v3: Vector2D = Vector2D { x: 3.0, y: 4.0 };
    if (v1 == v3) {
        printf("v1 == v3: true\n");
    } else {
        printf("v1 == v3: false\n");
    }

    printf("\n=== Testing Complex operators ===\n");

    local c1: Complex = Complex { real: 2.0, imag: 3.0 };
    local c2: Complex = Complex { real: 1.0, imag: -1.0 };

    printf("c1 = ");
    c1.print();
    printf("\n");

    printf("c2 = ");
    c2.print();
    printf("\n");

    # Test addition
    local c_add: Complex = c1 + c2;
    printf("c1 + c2 = ");
    c_add.print();
    printf("\n");

    # Test multiplication
    local c_mul: Complex = c1 * c2;
    printf("c1 * c2 = ");
    c_mul.print();
    printf("\n");

    printf("\n=== Testing Callable struct ===\n");

    local mult: Multiplier = Multiplier { factor: 5.0 };
    local result1: float = mult(10.0);
    local result2: float = mult(3.5);

    printf("mult(10.0) = %.2f\n", result1);
    printf("mult(3.5) = %.2f\n", result2);

    printf("\n=== All tests completed ===\n");

    return 0;
}
