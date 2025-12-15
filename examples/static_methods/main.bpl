extern printf(fmt: string, ...);
# Test static methods and constructors
struct Counter {
    value: int,
    frame create(initial: int) ret Counter {
        local c: Counter;
        c.value = initial;
        return c;
    }
    frame increment(this: *Counter) {
        this.value = this.value + 1;
    }
    frame decrement(this: *Counter) {
        this.value = this.value - 1;
    }
    frame get_value(this: Counter) ret int {
        return this.value;
    }
    frame add(a: int, b: int) ret int {
        return a + b;
    }
}
struct Math {
    frame max(a: int, b: int) ret int {
        if (a > b) {
            return a;
        }
        return b;
    }
    frame min(a: int, b: int) ret int {
        if (a < b) {
            return a;
        }
        return b;
    }
    frame abs(n: int) ret int {
        if (n < 0) {
            return -n;
        }
        return n;
    }
}
frame main() ret int {
    printf("=== Static Methods Test ===\n");
    # Test static constructor
    local c1: Counter = Counter.create(10);
    printf("Counter 1 initial value: %d\n", c1.get_value());
    # Test instance methods
    c1.increment();
    c1.increment();
    printf("After 2 increments: %d\n", c1.get_value());
    c1.decrement();
    printf("After 1 decrement: %d\n", c1.get_value());
    # Test static utility methods
    local result: int = Counter.add(5, 7);
    printf("Static add(5, 7): %d\n", result);
    # Test pure static struct
    printf("\n=== Math Utilities ===\n");
    printf("max(42, 17): %d\n", Math.max(42, 17));
    printf("min(42, 17): %d\n", Math.min(42, 17));
    printf("abs(-25): %d\n", Math.abs(-25));
    printf("abs(30): %d\n", Math.abs(30));
    return 0;
}
