# Bug Hunt: Generic Edge Cases
import [printf] from "std/c.bpl";

# Test 1: Generic struct with unused type parameter
struct Unused<T> {
    x: int,
}

# Test 2: Multiple identical type parameters
struct DupParam<T, T> {
    x: T,
}

# Test 3: Generic constraint that doesn't exist
# spec Printable { frame print(this: *Printable); }
# struct Constrained<T: NonExistent> { value: T, }

# Test 4: Nested generics - very deep
struct Box<T> {
    value: T,
}

frame test_deep_generics() {
    local deep: Box<Box<Box<Box<Box<int>>>>> = Box<Box<Box<Box<Box<int>>>>> { value: Box<Box<Box<Box<int>>>> { value: Box<Box<Box<int>>> { value: Box<Box<int>> { value: Box<int> { value: 42 } } } } };
    printf("Deep value: %d\n", deep.value.value.value.value.value);
}

# Test 5: Generic function with conflicting inference
frame identity<T>(val: T) ret T {
    return val;
}

frame test_conflicting_inference() {
    # Should infer based on first arg
    local result = identity(42);
    printf("Identity result: %d\n", result);
}

frame main() {
    test_deep_generics();
    test_conflicting_inference();
    printf("Generic edge tests done\n");
}
