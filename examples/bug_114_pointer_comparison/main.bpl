# Test for BUG-114: Pointer comparison fix
# Pointers to structs (including those with vtables) can now be compared
# with nullptr and other pointers using == and !=

import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret *void;

frame alloc<T>() ret *T {
    return cast<*T>(malloc(sizeof<T>()));
}

# Simple struct without vtable
struct User {
    name: string,
    age: int,
}

frame main() ret int {
    # Test 1: Simple struct pointer comparisons
    printf("=== Test 1: Simple struct (User) ===\n");
    local u1: *User = alloc<User>();
    *u1 = User { name: "Alice", age: 30 };

    local u2: *User = alloc<User>();
    *u2 = User { name: "Bob", age: 25 };

    local u3: *User = u1;
    local u4: *User = nullptr;

    if (u1 != nullptr) {
        printf("u1 != nullptr: PASS\n");
    }
    if (u4 == nullptr) {
        printf("u4 == nullptr: PASS\n");
    }
    if (u1 == u3) {
        printf("u1 == u3 (same ptr): PASS\n");
    }
    if (u1 != u2) {
        printf("u1 != u2 (diff ptr): PASS\n");
    }
    # Test 2: Struct with vtable (String) pointer comparisons
    printf("\n=== Test 2: Struct with vtable (String) ===\n");
    local s1: *String = alloc<String>();
    *s1 = String.new("hello");

    local s2: *String = alloc<String>();
    *s2 = String.new("hello");

    local s3: *String = s1;
    local s4: *String = nullptr;

    if (s1 != nullptr) {
        printf("s1 != nullptr: PASS\n");
    }
    if (s4 == nullptr) {
        printf("s4 == nullptr: PASS\n");
    }
    if (s1 == s3) {
        printf("s1 == s3 (same ptr): PASS\n");
    }
    if (s1 != s2) {
        printf("s1 != s2 (diff ptr): PASS\n");
    }
    # Test 3: Value equality vs pointer identity
    printf("\n=== Test 3: Value vs Identity ===\n");
    # Pointer identity (same address?)
    if (s1 == s1) {
        printf("s1 == s1 (identity): PASS\n");
    }
    # Value equality (same content?) - requires dereference
    if (*s1 == *s2) {
        printf("*s1 == *s2 (value): PASS\n");
    }
    # Cleanup
    s1.destroy();
    s2.destroy();

    printf("\nAll tests passed!\n");
    return 0;
}
