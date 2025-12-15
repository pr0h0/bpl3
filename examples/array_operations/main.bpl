extern printf(fmt: string, ...);
# Test array operations and boundary conditions
frame test_array_initialization() {
    printf("=== Array Initialization ===\n");
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    arr[3] = 40;
    arr[4] = 50;
    local i: int = 0;
    loop (i < 5) {
        printf("arr[%d] = %d\n", i, arr[i]);
        i = i + 1;
    }
}
frame test_multidimensional_arrays() {
    printf("\n=== Multi-dimensional Arrays ===\n");
    # Simulated 2D array using 1D array (3x3 matrix)
    local matrix: int[9];
    # Initialize 3x3 identity-like matrix
    local row: int = 0;
    loop (row < 3) {
        local col: int = 0;
        loop (col < 3) {
            local index: int = (row * 3) + col;
            if (row == col) {
                matrix[index] = 1;
            } else {
                matrix[index] = 0;
            }
            col = col + 1;
        }
        row = row + 1;
    }
    # Print matrix
    printf("3x3 Matrix:\n");
    row = 0;
    loop (row < 3) {
        local c: int = 0;
        loop (c < 3) {
            local idx: int = (row * 3) + c;
            printf("%d ", matrix[idx]);
            c = c + 1;
        }
        printf("\n");
        row = row + 1;
    }
}
frame sum_array(arr: *int, size: int) ret int {
    local sum: int = 0;
    local i: int = 0;
    loop (i < size) {
        local ptr: *int = arr + i;
        sum = sum + *ptr;
        i = i + 1;
    }
    return sum;
}
frame test_array_functions() {
    printf("\n=== Array as Function Parameter ===\n");
    local numbers: int[6];
    numbers[0] = 5;
    numbers[1] = 10;
    numbers[2] = 15;
    numbers[3] = 20;
    numbers[4] = 25;
    numbers[5] = 30;
    local total: int = sum_array(&numbers[0], 6);
    printf("Sum of array: %d\n", total);
}
frame test_float_arrays() {
    printf("\n=== Float Arrays ===\n");
    local temps: float[4];
    temps[0] = 98.6;
    temps[1] = 100.2;
    temps[2] = 99.1;
    temps[3] = 97.8;
    printf("Temperature readings:\n");
    local i: int = 0;
    loop (i < 4) {
        printf("  Reading %d: %.1fF\n", i, temps[i]);
        i = i + 1;
    }
}
frame main() ret int {
    test_array_initialization();
    test_multidimensional_arrays();
    test_array_functions();
    test_float_arrays();
    return 0;
}
