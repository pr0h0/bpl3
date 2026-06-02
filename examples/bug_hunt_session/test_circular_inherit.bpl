# Bug Hunt: Circular Inheritance
import [printf] from "std/c.bpl";

# Test: Circular inheritance A -> B -> A
struct CircleA: CircleB {
    a: int,
}
struct CircleB: CircleA {
    b: int,
}

frame main() {
    printf("Test\n");
}
