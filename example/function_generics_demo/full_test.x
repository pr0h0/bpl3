import printf from "libc";

# Generic function
frame identity(val: T) ret T {
    return val;
}

frame swap(a: A, b: B) ret A {
    return a;
}

# Non-generic struct with generic methods
struct Container {
    count: u64,

    frame process(item: T) ret T {
        call printf("Processing %d (count=%d)\n", item, this.count);
        return item;
    }

    frame add(a: T, b: T) ret T {
        return a;
    }
}

frame main() ret i32 {
    call printf("=== Testing Generic Functions ===\n");

    # Test generic functions with different types
    local x: u64 = call identity(42);
    call printf("identity<u64>(42) = %d\n", x);

    local y: u32 = call identity(100);
    call printf("identity<u32>(100) = %d\n", y);

    local z: u64 = call swap(1000, 2000);
    call printf("swap<u64, u32>(1000, 2000) = %d\n", z);

    call printf("\n=== Testing Generic Methods ===\n");

    # Test generic methods on non-generic struct
    local c: Container = {count: 5};

    local v1: u64 = call c.process(999);
    call printf("Result: %d\n", v1);

    local v2: u32 = call c.process(42);
    call printf("Result: %d\n", v2);

    local sum: u64 = call c.add(10, 20);
    call printf("add<u64>(10, 20) = %d\n", sum);

    call printf("\n=== All Tests Passed! ===\n");
    return 0;
}
