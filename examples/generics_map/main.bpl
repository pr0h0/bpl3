extern printf(fmt: string, ...);
# Transformer functions
frame square(x: int) ret int {
    return x * x;
}
frame addOne(x: int) ret int {
    return x + 1;
}
# Generic map function
# Takes input array ptr, output array ptr, length, and transformer function
frame map<T, U>(input: *T, output: *U, len: int, transformer: Func<U>(T)) {
    local i: int = 0;
    loop (i < len) {
        # output[i] = transformer(input[i])
        output[i] = transformer(input[i]);
        i = i + 1;
    }
}
frame printArray(arr: *int, len: int, name: string) {
    printf("%s: ", name);
    local i: int = 0;
    loop (i < len) {
        printf("%d ", arr[i]);
        i = i + 1;
    }
    printf("\n");
}
frame main() ret int {
    local input: int[4];
    input[0] = 1;
    input[1] = 2;
    input[2] = 3;
    input[3] = 4;
    local squared: int[4];
    local added: int[4];
    # Map to square
    # explicit generics: map<int, int>
    map<int, int>(input, squared, 4, square);
    # Map to addOne
    map<int, int>(input, added, 4, addOne);
    printArray(squared, 4, "Squared");
    printArray(added, 4, "AddOne");
    return 0;
}
