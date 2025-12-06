# Test that Array.x's malloc import works without re-importing in main
import printf from "libc";
import [Array] from "../../lib/array.x";

extern printf(format: *u8, ...);

frame main() ret i32 {
    local arr: Array<u64>;
    call arr.push(42);
    call arr.push(99);

    call printf("Array length: %llu\n", call arr.len());
    call printf("First: %llu\n", call arr.get(0));
    call printf("Second: %llu\n", call arr.get(1));

    return 0;
}
