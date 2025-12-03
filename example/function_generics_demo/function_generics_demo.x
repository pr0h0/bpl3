import printf from "libc";

# Test function-level generics
frame identity(val: T) ret T {
    return val;
}

frame swap(a: A, b: B) ret A {
    call printf("Before swap: a=%d, b=%d\n", a, b);
    return a;
}

# Test struct with methods
struct Box<T> {
    value: T,

    frame wrap(other: U) ret U {
        # Method with different generic parameter (OK)

        call printf("Wrapping value %d with %d\n", this.value, other);
        return other;
    }
}

# Test non-generic struct with generic method
struct Container {
    count: u64,

    frame process(item: T) ret T {
        call printf("Processing item: %d (count=%d)\n", item, this.count);
        return item;
    }
}

frame main() ret u8 {
    # Test generic function
    local x: u64 = call identity(42);
    call printf("Identity of 42: %d\n", x);

    local y: u64 = call swap(100, 200);
    call printf("Result: %d\n", y);

    # Test generic struct method
    local box: Box<u64> = {value: 10};
    local result: u32 = call box.wrap(20);
    call printf("Wrap result: %d\n", result);

    # Test non-generic struct with generic method
    local c: Container = {count: 5};
    local v: u64 = call c.process(999);
    call printf("Process result: %d\n", v);

    return 0;
}
