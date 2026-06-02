import [Hashable] from "std/core_specs.bpl";

import [printf] from "std/c.bpl";

struct MyInt: Hashable<MyInt> {
    val: int,
    frame hash(this: *MyInt) ret u64 {
        return 0;
    }
}

frame test<T: Hashable<T>>(val: T) {
    # local h: u64 = val.hash(); 
    # Try calling on pointer since hash takes *T
    local ptr: *T = &val;
    local h: u64 = ptr.hash();
    printf("Hash: %lu\n", h);
}
frame main() ret int {
    local i: MyInt;
    i.val = 1;
    test<MyInt>(i);
    return 0;
}
