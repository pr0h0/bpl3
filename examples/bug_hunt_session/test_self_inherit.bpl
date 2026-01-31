# Bug Hunt: More Type Edge Cases
extern printf(fmt: string, ...);

# Test: Self-inheriting struct - check if caught
struct SelfInherit: SelfInherit {
    x: int,
}

frame main() {
    printf("Test\n");
}
