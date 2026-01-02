extern printf(fmt: string, ...) ret int;

frame main() {
    # Test array equality
    local arr1: int[5];
    local arr2: int[5];

    arr1[0] = 1;
    arr1[1] = 2;
    arr1[2] = 3;
    arr1[3] = 4;
    arr1[4] = 5;

    arr2[0] = 1;
    arr2[1] = 2;
    arr2[2] = 3;
    arr2[3] = 4;
    arr2[4] = 5;

    if (arr1 == arr2) {
        printf("Arrays are equal\n");
    } else {
        printf("Arrays are not equal\n");
    }

    # Change one element
    arr2[2] = 99;

    printf("After change: arr1[2]=%d, arr2[2]=%d\n", arr1[2], arr2[2]);

    if (arr1 == arr2) {
        printf("Arrays are equal (WRONG!)\n");
    } else {
        printf("Arrays are not equal (correct)\n");
    }

    printf("SUCCESS\n");
}
