# Bug Hunt: Circular Inheritance
extern printf(fmt: string, ...);

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
