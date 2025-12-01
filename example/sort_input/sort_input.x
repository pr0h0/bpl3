import printf, scanf, malloc, free from "libc";

extern malloc(size: u64) ret *u8;

frame main() ret u64 {
    local n: u64 = 0;
    call printf("Enter number of elements: ");
    call scanf("%lu", &n);

    if n == 0 {
        call printf("No elements to sort.\n");
        return 0;
    }

    # Allocate memory for array
    local arr: *u64 = call malloc(n * 8);
    if arr == NULL {
        call printf("Memory allocation failed.\n");
        return 1;
    }

    call printf("Enter %lu numbers:\n", n);
    local i: u64 = 0;
    loop {
        if i >= n {
            break;
        }
        call scanf("%lu", &arr[i]);
        i = i + 1;
    }

    # Bubble Sort Algorithm
    # Time Complexity: O(n^2)
    local j: u64 = 0;
    i = 0;
    loop {
        if i >= n - 1 {
            break;
        }
        j = 0;
        loop {
            if j >= n - i - 1 {
                break;
            }

            # Swap if the element found is greater than the next element
            if arr[j] > arr[j + 1] {
                local temp: u64 = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
            j = j + 1;
        }
        i = i + 1;
    }

    call printf("Sorted numbers:\n");
    i = 0;
    loop {
        if i >= n {
            break;
        }
        call printf("%li ", arr[i]);
        i = i + 1;
    }
    call printf("\n");

    call free(arr);
    return 0;
}
