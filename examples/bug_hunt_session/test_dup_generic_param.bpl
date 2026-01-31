# Bug Hunt: Duplicate Generic Params
extern printf(fmt: string, ...);

# Test: Multiple identical type parameters (should error)
struct DupParam<T, T> {
    x: T,
}

frame main() {
    printf("Test\n");
}
