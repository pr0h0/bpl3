extern printf(fmt: string, ...);
# (True generics require monomorphization which is not yet implemented)
struct Box<T> {
    value: T,
}
frame make_generic_box<T>(val: T) ret Box<T> {
    local b: Box<T>;
    b.value = val;
    return b;
}
frame main() ret int {
    # Test different struct types (simulating generics)
    local int_box: Box<int> = make_generic_box<int>(100);
    printf("Int box value: %d\n", int_box.value);
    local float_box: Box<float> = make_generic_box<float>(2.718);
    printf("Float box value: %.3f\n", float_box.value);
    local another_box: Box<int> = make_generic_box<int>(42);
    printf("Another int box: %d\n", another_box.value);
    local generic_box: Box<int> = make_generic_box<int>(123);
    printf("Generic int box: %d\n", generic_box.value);
    local generic_box_float: Box<float> = make_generic_box<float>(3.14);
    printf("Generic float box: %.2f\n", generic_box_float.value);
    return 0;
}
