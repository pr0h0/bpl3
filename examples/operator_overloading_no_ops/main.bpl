# Test without using operators - just declare the struct

import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
    frame __add__(this: *Box<T>, other: T) ret Box<T> {
        local result: Box<T>;
        result.val = this.val + other;
        return result;
    }
}

frame main() ret int {
    local b: Box<int>;
    b.val = 10;
    printf("value: %d\n", b.val);
    return 0;
}
