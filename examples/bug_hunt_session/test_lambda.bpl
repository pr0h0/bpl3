# Bug Hunt: Lambda and Closure Edge Cases
extern printf(fmt: string, ...);

# Test 1: Lambda capturing itself (recursive lambda)
frame test_recursive_lambda() {
    # local recurse: Lambda<int>(int);
    # recurse = |n: int| ret int {
    #     if (n <= 1) {
    #         return n;
    #     }
    #     return recurse(n - 1) + recurse(n - 2);  # Can lambda capture itself?
    # };
}

# Test 2: Lambda returning lambda
frame test_nested_lambda() ret Lambda<int>(int) {
    return |x: int| ret int {
        return x * 2;
    };
}

# Test 3: Lambda modifying captured variable
frame test_capture_modify() {
    local counter: int = 0;
    local inc: Lambda<void>() = |&| ret void {
        counter = counter + 1;
    };
    inc();
    inc();
    printf("Counter after 2 incs: %d\n", counter);
}

# Test 4: Lambda capturing pointer
frame test_capture_pointer() {
    local x: int = 42;
    local ptr: *int = &x;
    local getVal: Lambda<int>() = |&| ret int {
        return *ptr;
    };
    printf("Captured pointer value: %d\n", getVal());
}

# Test 5: Empty lambda body
frame test_empty_lambda() {
    local noop: Lambda<void>() = || ret void {};
    noop();
}

# Test 6: Lambda with many parameters
frame test_many_params() {
    local sum: Lambda<int>(int, int, int, int, int) = |a: int, b: int, c: int, d: int, e: int| ret int {
        return a + b + c + d + e;
    };
    printf("Sum of 1-5: %d\n", sum(1, 2, 3, 4, 5));
}

# Test 7: Lambda as struct field
struct Callback {
    fn: Lambda<void>(),
}

frame test_lambda_in_struct() {
    local cb: Callback = Callback {
        fn: || ret void { printf("Callback called\n"); },
    };
    cb.fn();
}

frame main() {
    local doubled: Lambda<int>(int) = test_nested_lambda();
    printf("Doubled 5: %d\n", doubled(5));
    
    test_capture_modify();
    test_capture_pointer();
    test_empty_lambda();
    test_many_params();
    test_lambda_in_struct();
    printf("Lambda tests done\n");
}
