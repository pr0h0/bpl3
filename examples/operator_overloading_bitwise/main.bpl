# Test bitwise operator overloading

import [printf] from "std/c.bpl";

# BitSet - a set of flags using bitwise operations
struct BitSet {
    flags: int,
    # Bitwise AND: set1 & set2
    frame __and__(this: *BitSet, other: BitSet) ret BitSet {
        local result: BitSet = BitSet { flags: this.flags & other.flags };
        return result;
    }

    # Bitwise OR: set1 | set2
    frame __or__(this: *BitSet, other: BitSet) ret BitSet {
        local result: BitSet = BitSet { flags: this.flags | other.flags };
        return result;
    }

    # Bitwise XOR: set1 ^ set2
    frame __xor__(this: *BitSet, other: BitSet) ret BitSet {
        local result: BitSet = BitSet { flags: this.flags ^ other.flags };
        return result;
    }

    # Bitwise NOT: ~set
    frame __not__(this: *BitSet) ret BitSet {
        local result: BitSet = BitSet { flags: ~this.flags };
        return result;
    }

    # Left shift: set << n
    frame __lshift__(this: *BitSet, shift: int) ret BitSet {
        local result: BitSet = BitSet { flags: this.flags << shift };
        return result;
    }

    # Right shift: set >> n
    frame __rshift__(this: *BitSet, shift: int) ret BitSet {
        local result: BitSet = BitSet { flags: this.flags >> shift };
        return result;
    }

    # Equality: set1 == set2
    frame __eq__(this: *BitSet, other: BitSet) ret bool {
        return this.flags == other.flags;
    }

    # Not equal: set1 != set2
    frame __ne__(this: *BitSet, other: BitSet) ret bool {
        return this.flags != other.flags;
    }

    # Print in binary
    frame print(this: *BitSet) {
        printf("BitSet(0x%08x)", this.flags);
    }
}

# Integer wrapper with comparison operators
struct Integer {
    value: int,
    # Less than: a < b
    frame __lt__(this: *Integer, other: Integer) ret bool {
        return this.value < other.value;
    }

    # Less than or equal: a <= b
    frame __le__(this: *Integer, other: Integer) ret bool {
        return this.value <= other.value;
    }

    # Greater than: a > b
    frame __gt__(this: *Integer, other: Integer) ret bool {
        return this.value > other.value;
    }

    # Greater than or equal: a >= b
    frame __ge__(this: *Integer, other: Integer) ret bool {
        return this.value >= other.value;
    }

    # Equality: a == b
    frame __eq__(this: *Integer, other: Integer) ret bool {
        return this.value == other.value;
    }

    # Not equal: a != b
    frame __ne__(this: *Integer, other: Integer) ret bool {
        return this.value != other.value;
    }
}

frame main() ret int {
    printf("=== Testing BitSet bitwise operators ===\n");

    local set1: BitSet = BitSet { flags: 15 }; # 0b00001111
    local set2: BitSet = BitSet { flags: 51 }; # 0b00110011
    local set3: BitSet = BitSet { flags: 85 }; # 0b01010101

    printf("set1 = ");
    set1.print();
    printf("\n");

    printf("set2 = ");
    set2.print();
    printf("\n");

    printf("set3 = ");
    set3.print();
    printf("\n\n");

    # Test AND
    local and_result: BitSet = set1 & set2;
    printf("set1 & set2 = ");
    and_result.print();
    printf("\n");

    # Test OR
    local or_result: BitSet = set1 | set2;
    printf("set1 | set2 = ");
    or_result.print();
    printf("\n");

    # Test XOR
    local xor_result: BitSet = set1 ^ set2;
    printf("set1 ^ set2 = ");
    xor_result.print();
    printf("\n");

    # Test NOT
    local not_result: BitSet = ~set1;
    printf("~set1 = ");
    not_result.print();
    printf("\n");

    # Test left shift
    local lshift_result: BitSet = set1 << 4;
    printf("set1 << 4 = ");
    lshift_result.print();
    printf("\n");

    # Test right shift
    local rshift_result: BitSet = set2 >> 2;
    printf("set2 >> 2 = ");
    rshift_result.print();
    printf("\n");

    # Test equality
    local set4: BitSet = BitSet { flags: 15 };
    if (set1 == set4) {
        printf("set1 == set4: true\n");
    } else {
        printf("set1 == set4: false\n");
    }

    # Test inequality
    if (set1 != set2) {
        printf("set1 != set2: true\n");
    } else {
        printf("set1 != set2: false\n");
    }

    printf("\n=== Testing Integer comparison operators ===\n");

    local a: Integer = Integer { value: 10 };
    local b: Integer = Integer { value: 20 };
    local c: Integer = Integer { value: 10 };

    printf("a.value = %d\n", a.value);
    printf("b.value = %d\n", b.value);
    printf("c.value = %d\n\n", c.value);

    if (a < b) {
        printf("a < b: true\n");
    } else {
        printf("a < b: false\n");
    }

    if (a <= c) {
        printf("a <= c: true\n");
    } else {
        printf("a <= c: false\n");
    }

    if (b > a) {
        printf("b > a: true\n");
    } else {
        printf("b > a: false\n");
    }

    if (a >= c) {
        printf("a >= c: true\n");
    } else {
        printf("a >= c: false\n");
    }

    if (a == c) {
        printf("a == c: true\n");
    } else {
        printf("a == c: false\n");
    }

    if (a != b) {
        printf("a != b: true\n");
    } else {
        printf("a != b: false\n");
    }

    printf("\n=== All tests completed ===\n");

    return 0;
}
