import printf from "libc";

# Test non-generic struct with non-generic method
struct Container {
    count: u64,

    frame process(item: u64) ret u64 {
        call printf("Processing item: %d (count=%d)\n", item, this.count);
        return item;
    }
}

frame main() ret u8 {
    local c: Container = {count: 5};
    local v: u64 = call c.process(999);
    call printf("Process result: %d\n", v);

    return 0;
}
