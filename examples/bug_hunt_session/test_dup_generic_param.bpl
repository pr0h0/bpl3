# Bug Hunt: Duplicate Generic Params
import [printf] from "std/c.bpl";

# Test: Multiple identical type parameters (should error)
struct DupParam<T, T> {
    x: T,
}

frame main() {
    printf("Test\n");
}
