extern printf(fmt: string, ...);
# Callback: match signature Func<int>(int, int)
# Meaning: returns int, takes (int, int)
frame forEachCallback(el: int, index: int) ret int {
    printf("%d: %d\n", index, el);
    return 0;
}
# Generic function taking a function pointer
# func type: Func<int>(T, int)
frame forEach<T>(arr: *T, len: int, fn: Func<int>(T, int)) {
    local i: int = 0;
    loop (i < len) {
        # Call the function pointer
        fn(arr[i], i);
        i = i + 1;
    }
}
frame main() ret int {
    local arr: int[3];
    arr[0] = 1;
    arr[1] = 2;
    arr[2] = 3;
    # Instantiates forEach<int>(int[], int, Func<int>(int, int))
    # Should work if substitution works correctly on function types
    forEach<int>(arr, 3, forEachCallback);
    return 0;
}
