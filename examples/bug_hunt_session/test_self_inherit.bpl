# Bug Hunt: More Type Edge Cases
import [printf] from "std/c.bpl";

# Test: Self-inheriting struct - check if caught
struct SelfInherit: SelfInherit {
    x: int,
}

frame main() {
    printf("Test\n");
}
