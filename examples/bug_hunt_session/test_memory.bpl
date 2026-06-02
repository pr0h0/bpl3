# Bug Hunt: Memory and Pointer Edge Cases
import [printf] from "std/c.bpl";
extern malloc(size: u64) ret *void;
import [free] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

# Test 1: Pointer arithmetic on void pointer
frame test_void_ptr_arith() {
    local ptr: *void = malloc(100);
    # local next: *void = ptr + 1;  # Should this work?
    free(ptr);
}

# Test 2: Null pointer dereference (runtime error)
frame test_null_deref() {
    local ptr: *int = nullptr;
    # local val: int = *ptr;  # Would crash
    printf("Null ptr address: %p\n", ptr);
}

# Test 3: Dangling pointer (use after free)
frame test_dangling() {
    local ptr: *int = cast<*int>(malloc(4));
    *ptr = 42;
    free(cast<*void>(ptr));
    # Using ptr after free is undefined behavior
    # printf("Dangling value: %d\n", *ptr);
}

# Test 4: Double free
frame test_double_free() {
    local ptr: *int = cast<*int>(malloc(4));
    free(cast<*void>(ptr));
    # free(cast<*void>(ptr));  # Double free - undefined behavior
}

# Test 5: Pointer comparison with different types
frame test_ptr_comparison() {
    local intPtr: *int = cast<*int>(malloc(4));
    local charPtr: *char = cast<*char>(intPtr);

    # Can we compare pointers of different types?
    local same: bool = intPtr == cast<*int>(charPtr);
    printf("Same pointer: %d\n", cast<int>(same));

    free(cast<*void>(intPtr));
}

# Test 6: Pointer to pointer
frame test_ptr_to_ptr() {
    local x: int = 42;
    local ptr: *int = &x;
    local ptrPtr: **int = &ptr;
    printf("Double deref: %d\n", **ptrPtr);
}

# Test 7: Array decay to pointer
frame test_array_decay() {
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    local ptr: *int = &arr[0];
    printf("First element: %d\n", *ptr);
}

# Test 8: Struct pointer access
frame test_struct_ptr() {
    local p: Point = Point { x: 10, y: 20 };
    local ptr: *Point = &p;
    printf("Point: (%d, %d)\n", ptr.x, ptr.y);
}

frame main() {
    test_void_ptr_arith();
    test_null_deref();
    test_dangling();
    test_double_free();
    test_ptr_comparison();
    test_ptr_to_ptr();
    test_array_decay();
    test_struct_ptr();
    printf("Memory tests done\n");
}
