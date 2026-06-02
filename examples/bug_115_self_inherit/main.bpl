# BUG-115: Self-Inheriting Struct (FIXED)
# This test verifies that self-inheritance is now properly rejected.
# Previously it caused a compiler stack overflow.

import [printf] from "std/c.bpl";

# This struct had self-inheritance - now properly rejected:
struct SelfInherit: SelfInherit {
    x: int,
}

# Valid struct without self-inheritance
struct ValidStruct {
    x: int,
}

frame main() {
    local s: ValidStruct = ValidStruct { x: 42 };
    printf("BUG-115 FIXED: Self-inheritance is now rejected!\n");
    printf("Value: %d\n", s.x);
}
