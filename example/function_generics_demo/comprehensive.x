import printf from "libc";

# Test function-level generics
frame identity<T>(val: T) ret T {
    return val;
}

frame swap<A, B>(a: A, b: B) ret A {
    call printf("Swap: a=%d, b=%d\n", a, b);
    return a;
}

# Test non-generic struct with generic method
struct Container {
    count: u64,
    
    frame process<T>(item: T) ret T {
        call printf("Processing item: %d (count=%d)\n", item, this.count);
        return item;
    }
    
    frame add<T>(a: T, b: T) ret T {
        call printf("Adding: %d + %d (count=%d)\n", a, b, this.count);
        return a;
    }
}frame main() ret u8 {
    # Test generic functions
    local x: u64 = call identity<u64>(42);
    call printf("identity<u64>(42) = %d\n", x);

    local y: u32 = call identity<u32>(100);
    call printf("identity<u32>(100) = %d\n", y);

    local z: u64 = call swap<u64, u32>(1000, 2000);
    call printf("swap result = %d\n", z);

    # Test non-generic struct with generic methods
    local c: Container = {count: 5};

    local v1: u64 = call c.process<u64>(999);
    call printf("process<u64> result: %d\n", v1);

    local v2: u32 = call c.process<u32>(42);
    call printf("process<u32> result: %d\n", v2);

    local sum: u64 = call c.add<u64>(10, 20);
    call printf("add<u64> result: %d\n", sum);

    return 0;
}
