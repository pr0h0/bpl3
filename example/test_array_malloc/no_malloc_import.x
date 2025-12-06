# Test that malloc import from Array.x works without explicit import in main
# This file deliberately does NOT import malloc
import printf from "libc";
import [Array] from "../../lib/array.x";

extern printf(format: *u8, ...);

frame main() ret i32 {
    # Array methods use malloc/realloc internally
    # Without the fix, this would fail because malloc isn't imported here
    local numbers: Array<u64>;

    call numbers.push(1);
    call numbers.push(2);
    call numbers.push(3);
    call numbers.push(4);
    call numbers.push(5);

    local i: u64 = 0;
    loop {
        if i >= (call numbers.len()) {
            break;
        }
        call printf("numbers[%llu] = %llu\n", i, call numbers.get(i));
        i = i + 1;
    }

    call printf("\nTotal elements: %llu\n", call numbers.len());

    return 0;
}
