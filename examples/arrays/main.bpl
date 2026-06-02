import [printf] from "std/c.bpl";

frame printArray(arr: *int, size: int) {
    local i: int = 0;
    printf("[ ");
    loop (i < size) {
        printf("%d ", arr[i]);
        i = i + 1;
    }
    printf("]\n");
}

frame doubleArray(arr: *int, size: int) {
    local i: int = 0;
    loop (i < size) {
        arr[i] = arr[i] * 2;
        i = i + 1;
    }
}

frame main() ret int {
    printf("--- Arrays Test ---\n");

    # 1. Basic Array
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    arr[3] = 40;
    arr[4] = 50;

    printf("Original Array: ");
    printArray(arr, 5);

    # 2. Modify Array via Pointer
    doubleArray(arr, 5);
    printf("Doubled Array: ");
    printArray(arr, 5);

    # 3. Array Indexing Logic
    local sum: int = 0;
    local i: int = 0;
    loop (i < 5) {
        sum = sum + arr[i];
        i = i + 1;
    }
    printf("Sum of elements: %d\n", sum);

    # 4. Nested Arrays (2D)
    # Note: BPL might not support int[2][2] syntax directly in all contexts yet,
    # but let's try if it works. If not, we'll use flat array.
    # Based on previous files, flat arrays are common.
    # Let's try to declare a 2D array.

    # local matrix: int[2][2]; # This might be risky if not fully supported.
    # Let's stick to flat array for 2D simulation to be safe and robust for this basic example.

    local matrix: int[4]; # 2x2
    matrix[0] = 1;
    matrix[1] = 2;
    matrix[2] = 3;
    matrix[3] = 4;

    printf("2x2 Matrix (flat):\n");
    printf("%d %d\n", matrix[0], matrix[1]);
    printf("%d %d\n", matrix[2], matrix[3]);

    return 0;
}
