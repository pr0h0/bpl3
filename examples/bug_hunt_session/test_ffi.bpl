# Bug Hunt: FFI Edge Cases
extern printf(fmt: string, ...);
extern strlen(s: string) ret u64;
extern strcpy(dest: *char, src: string) ret *char;
extern malloc(size: u64) ret *void;
extern free(ptr: *void);

# Test 1: extern with wrong types (should error at link time or crash)
extern puts(s: string) ret int;

# Test 2: extern function returning struct (might not work)
# struct TimeVal {
#     tv_sec: i64,
#     tv_usec: i64,
# }
# extern gettimeofday(tv: *TimeVal, tz: *void) ret int;

# Test 3: Calling variadic extern
frame test_variadic_extern() {
    printf("Int: %d, Float: %f, String: %s\n", 42, 3.14, "hello");
}

# Test 4: Passing null to extern
frame test_null_extern() {
    local len: u64 = strlen(nullptr); # This will crash
    printf("Len: %lu\n", len);
}

# Test 5: Wrong argument count (should error)
frame test_wrong_args() {
    # printf("test");  # Missing format args - printf is variadic so this is ok
    # strlen("test", "extra");  # Extra arg
}

# Test 6: Struct passed by value to extern
struct SmallStruct {
    x: int,
    y: int,
}

# extern takes_struct(s: SmallStruct) ret int;

frame main() {
    test_variadic_extern();
    puts("Using puts");

    local len: u64 = strlen("hello");
    printf("Length: %lu\n", len);

    # Don't call test_null_extern - it will crash
    # test_null_extern();

    printf("FFI tests done\n");
}
