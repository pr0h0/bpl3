# Test function generics with explicit type arguments
import printf from "libc";

# Generic identity function
frame identity(x: T) ret T {
    return x;
}

# Generic swap function (no return type)
frame swap(a: T, b: U) {
    call printf("Before swap: a=%lld, b=%lld\n", a, b);
    local temp: T = a;
    # Note: In a real implementation, we'd return both values
    # For demo, just print them
    call printf("After swap would exchange values\n");
}

# Generic max function for integers
frame max(a: T, b: T) ret T {
    if a > b {
        return a;
    }
    return b;
}

frame main() ret i32 {
    # Test identity with different types
    local x: u64 = call identity(42);
    local y: i32 = call identity(-10);
    local z: u8 = call identity(255);

    call printf("identity<u64>(42) = %llu\n", x);
    call printf("identity<i32>(-10) = %d\n", y);
    call printf("identity<u8>(255) = %u\n", z);

    # Test max with different types
    local maxU64: u64 = call max(100, 200);
    local maxI32: i32 = call max(-50, 30);

    call printf("max<u64>(100, 200) = %llu\n", maxU64);
    call printf("max<i32>(-50, 30) = %d\n", maxI32);

    # Test swap
    call swap(1000, -500);

    return 0;
}
