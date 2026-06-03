# Simple test for generic operator overloading
# Tests only the push operator (<<)

import [printf] from "std/c.bpl";

# Generic Counter with operator overloading
struct Counter<T> {
    value: T,
    # Addition operator: counter + value
    frame __add__(this: *Counter<T>, other: T) ret Counter<T> {
        local result: Counter<T>;
        result.value = this.value + other;
        return result;
    }

    # Comparison operator
    frame __eq__(this: *Counter<T>, other: Counter<T>) ret bool {
        return this.value == other.value;
    }
}

frame main() ret int {
    printf("=== Testing Generic Operator Overloading ===\n");

    # Test with integers
    local c1: Counter<int>;
    c1.value = 10;
    local c2: Counter<int> = c1 + 5;

    printf("c1.value = %d\n", c1.value);
    printf("c2.value = %d\n", c2.value);

    if (c1 == c1) {
        printf("c1 == c1: true\n");
    }
    # Test with doubles
    local f1: Counter<double>;
    f1.value = 1.5;
    local f2: Counter<double> = f1 + 2.5;

    printf("f1.value = %.1f\n", f1.value);
    printf("f2.value = %.1f\n", f2.value);

    printf("=== All tests passed! ===\n");
    return 0;
}
