# Comprehensive operator overloading test
# Tests all 24 operators in a single example

import [printf] from "std/c.bpl";

# All-in-one struct demonstrating every operator
struct AllOps {
    value: int,
    # Binary arithmetic
    frame __add__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value + other.value };
    }

    frame __sub__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value - other.value };
    }

    frame __mul__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value * other.value };
    }

    frame __div__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value / other.value };
    }

    frame __mod__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value % other.value };
    }

    # Binary bitwise
    frame __and__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value & other.value };
    }

    frame __or__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value | other.value };
    }

    frame __xor__(this: *AllOps, other: AllOps) ret AllOps {
        return AllOps { value: this.value ^ other.value };
    }

    frame __lshift__(this: *AllOps, shift: int) ret AllOps {
        return AllOps { value: this.value << shift };
    }

    frame __rshift__(this: *AllOps, shift: int) ret AllOps {
        return AllOps { value: this.value >> shift };
    }

    # Comparison
    frame __eq__(this: *AllOps, other: AllOps) ret bool {
        return this.value == other.value;
    }

    frame __ne__(this: *AllOps, other: AllOps) ret bool {
        return this.value != other.value;
    }

    frame __lt__(this: *AllOps, other: AllOps) ret bool {
        return this.value < other.value;
    }

    frame __le__(this: *AllOps, other: AllOps) ret bool {
        return this.value <= other.value;
    }

    frame __gt__(this: *AllOps, other: AllOps) ret bool {
        return this.value > other.value;
    }

    frame __ge__(this: *AllOps, other: AllOps) ret bool {
        return this.value >= other.value;
    }

    # Unary
    frame __neg__(this: *AllOps) ret AllOps {
        return AllOps { value: -this.value };
    }

    frame __not__(this: *AllOps) ret AllOps {
        return AllOps { value: ~this.value };
    }

    # Utility
    frame print(this: *AllOps) {
        printf("AllOps(%d)", this.value);
    }
}

frame main() ret int {
    printf("=== Comprehensive Operator Overloading Test ===\n\n");

    local a: AllOps = AllOps { value: 10 };
    local b: AllOps = AllOps { value: 3 };

    printf("a = ");
    a.print();
    printf("\n");

    printf("b = ");
    b.print();
    printf("\n\n");

    # Test all binary arithmetic
    printf("=== Binary Arithmetic ===\n");
    local add_result: AllOps = a + b;
    printf("a + b = ");
    add_result.print();
    printf("\n");

    local sub_result: AllOps = a - b;
    printf("a - b = ");
    sub_result.print();
    printf("\n");

    local mul_result: AllOps = a * b;
    printf("a * b = ");
    mul_result.print();
    printf("\n");

    local div_result: AllOps = a / b;
    printf("a / b = ");
    div_result.print();
    printf("\n");

    local mod_result: AllOps = a % b;
    printf("a %% b = ");
    mod_result.print();
    printf("\n\n");

    # Test all binary bitwise
    printf("=== Binary Bitwise ===\n");
    local and_result: AllOps = a & b;
    printf("a & b = ");
    and_result.print();
    printf("\n");

    local or_result: AllOps = a | b;
    printf("a | b = ");
    or_result.print();
    printf("\n");

    local xor_result: AllOps = a ^ b;
    printf("a ^ b = ");
    xor_result.print();
    printf("\n");

    local lshift_result: AllOps = a << 2;
    printf("a << 2 = ");
    lshift_result.print();
    printf("\n");

    local rshift_result: AllOps = a >> 1;
    printf("a >> 1 = ");
    rshift_result.print();
    printf("\n\n");

    # Test all comparison
    printf("=== Comparison ===\n");
    if (a == b) {
        printf("a == b: true\n");
    } else {
        printf("a == b: false\n");
    }

    if (a != b) {
        printf("a != b: true\n");
    } else {
        printf("a != b: false\n");
    }

    if (a < b) {
        printf("a < b: true\n");
    } else {
        printf("a < b: false\n");
    }

    if (a <= b) {
        printf("a <= b: true\n");
    } else {
        printf("a <= b: false\n");
    }

    if (a > b) {
        printf("a > b: true\n");
    } else {
        printf("a > b: false\n");
    }

    if (a >= b) {
        printf("a >= b: true\n");
    } else {
        printf("a >= b: false\n");
    }

    printf("\n");

    # Test all unary
    printf("=== Unary ===\n");
    local neg_result: AllOps = -a;
    printf("-a = ");
    neg_result.print();
    printf("\n");

    local not_result: AllOps = ~a;
    printf("~a = ");
    not_result.print();
    printf("\n\n");

    printf("=== Test Complete: All 18 operators tested! ===\n");

    return 0;
}
