# Bug Hunt: Array Edge Cases
extern printf(fmt: string, ...);
extern malloc(size: u64) ret *void;
extern free(ptr: *void);

# Test 1: Array of structs initialization
struct Point {
    x: int,
    y: int,
}

frame test_array_of_structs() {
    local points: Point[3];
    points[0] = Point { x: 1, y: 2 };
    points[1] = Point { x: 3, y: 4 };
    points[2] = Point { x: 5, y: 6 };

    loop (local i: int = 0; i < 3; i = i + 1) {
        printf("Point %d: (%d, %d)\n", i, points[i].x, points[i].y);
    }
}

# Test 2: Multidimensional array
frame test_multidim() {
    local matrix: int[3][3];
    local count: int = 0;

    loop (local i: int = 0; i < 3; i = i + 1) {
        loop (local j: int = 0; j < 3; j = j + 1) {
            matrix[i][j] = count;
            count = count + 1;
        }
    }

    loop (local i: int = 0; i < 3; i = i + 1) {
        loop (local j: int = 0; j < 3; j = j + 1) {
            printf("%d ", matrix[i][j]);
        }
        printf("\n");
    }
}

# Test 3: Array as function parameter
frame sum_array(arr: *int, len: int) ret int {
    local total: int = 0;
    loop (local i: int = 0; i < len; i = i + 1) {
        total = total + arr[i];
    }
    return total;
}

frame test_array_param() {
    local arr: int[5];
    arr[0] = 1;
    arr[1] = 2;
    arr[2] = 3;
    arr[3] = 4;
    arr[4] = 5;

    local total: int = sum_array(&arr[0], 5);
    printf("Sum: %d\n", total);
}

# Test 4: Array literal in initialization
frame test_array_literal() {
    local arr: int[5] = [1, 2, 3, 4, 5];
    loop (local i: int = 0; i < 5; i = i + 1) {
        printf("arr[%d] = %d\n", i, arr[i]);
    }
}

# Test 5: Array element as lvalue
frame test_array_lvalue() {
    local arr: int[5] = [0, 0, 0, 0, 0];
    arr[2] = 42;
    printf("arr[2] = %d\n", arr[2]);

    # Compound assignment
    arr[2] += 10;
    printf("After +=: arr[2] = %d\n", arr[2]);
}

# Test 6: Pointer to array element
frame test_array_pointer() {
    local arr: int[5] = [10, 20, 30, 40, 50];
    local ptr: *int = &arr[2];
    printf("*ptr = %d\n", *ptr);

    # Pointer arithmetic
    ptr = ptr + 1;
    printf("After ptr + 1: %d\n", *ptr);
}

frame main() {
    printf("=== Array of structs ===\n");
    test_array_of_structs();

    printf("\n=== Multidimensional ===\n");
    test_multidim();

    printf("\n=== Array param ===\n");
    test_array_param();

    printf("\n=== Array literal ===\n");
    test_array_literal();

    printf("\n=== Array lvalue ===\n");
    test_array_lvalue();

    printf("\n=== Array pointer ===\n");
    test_array_pointer();

    printf("\nAll array tests done\n");
}
