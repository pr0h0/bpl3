import printf from "libc";

# Test non-generic struct with generic method
struct Container {
    count: u64,

    frame process(item: T) ret T {
        call printf("Processing item: %d (count=%d)\n", item, this.count);
        return item;
    }
}

frame main() ret u8 {
    # Test non-generic struct with generic method
    local c: Container = {count: 5};
    local v: u64 = call c.process(999);
    call printf("Process result: %d\n", v);

    local x: u32 = call c.process(42);
    call printf("Process result: %d\n", x);

    return 0;
}
