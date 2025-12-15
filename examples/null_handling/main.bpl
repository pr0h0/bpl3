extern printf(fmt: string, ...);
extern malloc(size: uint) ret *i8;
frame testNullptr() {
    printf("Testing nullptr:\n");
    local ptr: *int = nullptr;
    if (ptr == nullptr) {
        printf("ptr is nullptr\n");
    }
    # Assign actual value
    local value: int = 42;
    ptr = &value;
    if (ptr != nullptr) {
        printf("ptr is not nullptr, value: %d\n", *ptr);
    }
}
frame safeDeref(ptr: *int) ret int {
    if (ptr == nullptr) {
        printf("Null pointer passed, returning -1\n");
        return -1;
    }
    return *ptr;
}
frame findValue(arr: *int, size: int, target: int) ret *int {
    local i: int = 0;
    loop (i < size) {
        if (arr[i] == target) {
            return &arr[i];
        }
        ++i;
    }
    return nullptr; # Not found
}
frame testPointerComparison() {
    printf("\nTesting pointer comparison:\n");
    local a: int = 10;
    local b: int = 20;
    local p1: *int = &a;
    local p2: *int = &b;
    local p3: *int = &a;
    local p4: *int = nullptr;
    if (p1 == p3) {
        printf("p1 and p3 point to same location\n");
    }
    if (p1 != p2) {
        printf("p1 and p2 point to different locations\n");
    }
    if (p4 == nullptr) {
        printf("p4 is nullptr\n");
    }
}
frame testNullInStruct() {
    printf("\nTesting null in structs:\n");
    # Using malloc which can return null
    local mem: *i8 = malloc(cast<uint>(100));
    if (mem != nullptr) {
        printf("Memory allocated successfully\n");
    } else {
        printf("Memory allocation failed\n");
    }
}
frame returnNullOnError(shouldError: bool) ret *int {
    if (shouldError) {
        return nullptr;
    }
    local value: int = 100;
    return &value;
}
frame testVoidPointer() {
    printf("\nTesting void pointer:\n");
    local x: int = 42;
    local voidPtr: *i8 = cast<*i8>(&x);
    if (voidPtr != nullptr) {
        printf("void pointer is not null\n");
        local intPtr: *int = cast<*int>(voidPtr);
        printf("Value through void pointer: %d\n", *intPtr);
    }
}
frame main() ret int {
    testNullptr();
    # Test safe dereference
    printf("\nTesting safe dereference:\n");
    local val: int = 99;
    local result1: int = safeDeref(&val);
    printf("Safe deref result: %d\n", result1);
    local result2: int = safeDeref(nullptr);
    printf("Safe deref with null result: %d\n", result2);
    # Test find value
    printf("\nTesting find value:\n");
    local numbers: int[5];
    numbers[0] = 10;
    numbers[1] = 20;
    numbers[2] = 30;
    numbers[3] = 40;
    numbers[4] = 50;
    local found: *int = findValue(&numbers[0], 5, 30);
    if (found != nullptr) {
        printf("Found value: %d\n", *found);
    } else {
        printf("Value not found\n");
    }
    local notFound: *int = findValue(&numbers[0], 5, 99);
    if (notFound == nullptr) {
        printf("Value 99 not found (as expected)\n");
    }
    testPointerComparison();
    testNullInStruct();
    # Test null in conditionals
    printf("\nTesting null in conditionals:\n");
    local errorPtr: *int = returnNullOnError(true);
    if (errorPtr == nullptr) {
        printf("Error case returned nullptr\n");
    }
    testVoidPointer();
    # Test null assignment
    printf("\nTesting null assignment:\n");
    local dynPtr: *int = nullptr;
    printf("dynPtr initially: %s\n", dynPtr == nullptr ? "null" : "not null");
    local someValue: int = 777;
    dynPtr = &someValue;
    printf("dynPtr after assignment: %s, value: %d\n", dynPtr == nullptr ? "null" : "not null", *dynPtr);
    dynPtr = nullptr;
    printf("dynPtr after reset: %s\n", dynPtr == nullptr ? "null" : "not null");
    return 0;
}
