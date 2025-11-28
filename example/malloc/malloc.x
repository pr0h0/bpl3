import printf, malloc, free;

frame main() {
    local arr: *u64 = call malloc(5 * 8); # Allocate memory for 5 u64 integers
    call printf("Allocated array address: %p\n", arr);
    if (arr == NULL) {
        call printf("Memory allocation failed\n");
        return 1;
    }

    # Initialize the array
    local i: u64=0;
    loop {
        if (i >= 5) {
            break;
        }
        (arr + i * 8) = i * 10 + 4;
        call printf("arr[%d] = %d\n", i, arr[i]);
        i += 1;
    }

    call printf("Array contents after initialization:\n");
    
    i = 0;
    loop {
        if (i >= 5) {
            break;
        }
        arr[i] = *(arr + i * 8) + 1;
        call printf("arr[%d] = %d\n", i, arr[i]);
        i = i + 1;
    }

    call free(arr);

    return 0;
}
