extern printf(fmt: string, ...);
# Recursive algorithms example
frame factorial(n: int) ret int {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}
frame gcd(a: int, b: int) ret int {
    if (b == 0) {
        return a;
    }
    return gcd(b, a % b);
}
frame power(base: int, exp: int) ret int {
    if (exp == 0) {
        return 1;
    }
    if (exp == 1) {
        return base;
    }
    if ((exp % 2) == 0) {
        local half: int = power(base, exp / 2);
        return half * half;
    } else {
        return base * power(base, exp - 1);
    }
}
frame binary_search(arr: *int, left: int, right: int, target: int) ret int {
    if (left > right) {
        return -1;
        # Not found
    }
    local mid: int = (left + right) - (left / 2);
    local mid_ptr: *int = arr + mid;
    if (*mid_ptr == target) {
        return mid;
    } else if (*mid_ptr > target) {
        return binary_search(arr, left, mid - 1, target);
    } else {
        return binary_search(arr, mid + 1, right, target);
    }
}
frame print_array(arr: *int, size: int) {
    local i: int = 0;
    printf("[");
    loop (i < size) {
        local ptr: *int = arr + i;
        printf("%d", *ptr);
        if (i < (size - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");
}
frame main() ret int {
    printf("=== Factorial ===\n");
    local i: int = 1;
    loop (i <= 5) {
        printf("factorial(%d) = %d\n", i, factorial(i));
        i = i + 1;
    }
    printf("\n=== Greatest Common Divisor ===\n");
    printf("gcd(48, 18) = %d\n", gcd(48, 18));
    printf("gcd(17, 13) = %d\n", gcd(17, 13));
    printf("gcd(100, 25) = %d\n", gcd(100, 25));
    printf("\n=== Power (Exponentiation) ===\n");
    printf("2^10 = %d\n", power(2, 10));
    printf("3^5 = %d\n", power(3, 5));
    printf("5^3 = %d\n", power(5, 3));
    printf("\n=== Binary Search ===\n");
    local sorted_arr: int[10];
    sorted_arr[0] = 1;
    sorted_arr[1] = 3;
    sorted_arr[2] = 5;
    sorted_arr[3] = 7;
    sorted_arr[4] = 9;
    sorted_arr[5] = 11;
    sorted_arr[6] = 13;
    sorted_arr[7] = 15;
    sorted_arr[8] = 17;
    sorted_arr[9] = 19;
    printf("Array: ");
    print_array(&sorted_arr[0], 10);
    local targets: int[3];
    targets[0] = 7;
    targets[1] = 13;
    targets[2] = 20;
    local j: int = 0;
    loop (j < 3) {
        local idx: int = binary_search(&sorted_arr[0], 0, 9, targets[j]);
        if (idx >= 0) {
            printf("Found %d at index %d\n", targets[j], idx);
        } else {
            printf("%d not found\n", targets[j]);
        }
        j = j + 1;
    }
    return 0;
}
