# Comprehensive pointer and object comparison tests
# Tests pointer identity vs value equality semantics

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

import [printf] from "std/c.bpl";
import [malloc] from "std/c.bpl";
import [free] from "std/c.bpl";

frame alloc<T>() ret *T {
    return cast<*T>(malloc(sizeof<T>()));
}

struct Point {
    x: int,
    y: int,
}

struct Box<T> {
    value: T,
}

frame main() ret int {
    local passed: int = 0;
    local failed: int = 0;

    # Test 1: Primitive pointer comparisons
    printf("=== Primitive Pointers ===\n");
    local i1: *int = alloc<int>();
    local i2: *int = alloc<int>();
    *i1 = 42;
    *i2 = 42;

    if (i1 != nullptr) {
        passed = passed + 1;
        printf("PASS: i1 != nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: i1 != nullptr\n");
    }
    if (i1 == i1) {
        passed = passed + 1;
        printf("PASS: i1 == i1\n");
    } else {
        failed = failed + 1;
        printf("FAIL: i1 == i1\n");
    }
    if (i1 != i2) {
        passed = passed + 1;
        printf("PASS: i1 != i2\n");
    } else {
        failed = failed + 1;
        printf("FAIL: i1 != i2\n");
    }
    if (*i1 == *i2) {
        passed = passed + 1;
        printf("PASS: *i1 == *i2\n");
    } else {
        failed = failed + 1;
        printf("FAIL: *i1 == *i2\n");
    }

    free(cast<*void>(i1));
    free(cast<*void>(i2));

    # Test 2: Struct pointer comparisons
    printf("\n=== Struct Pointers ===\n");
    local p1: *Point = alloc<Point>();
    local p2: *Point = alloc<Point>();
    *p1 = Point { x: 10, y: 20 };
    *p2 = Point { x: 10, y: 20 };
    local p3: *Point = p1;

    if (p1 != nullptr) {
        passed = passed + 1;
        printf("PASS: p1 != nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: p1 != nullptr\n");
    }
    if (p1 == p3) {
        passed = passed + 1;
        printf("PASS: p1 == p3 (same ptr)\n");
    } else {
        failed = failed + 1;
        printf("FAIL: p1 == p3\n");
    }
    if (p1 != p2) {
        passed = passed + 1;
        printf("PASS: p1 != p2 (diff ptr)\n");
    } else {
        failed = failed + 1;
        printf("FAIL: p1 != p2\n");
    }

    free(cast<*void>(p1));
    free(cast<*void>(p2));

    # Test 3: Generic struct pointers
    printf("\n=== Generic Struct Pointers ===\n");
    local b1: *Box<int> = alloc<Box<int>>();
    local b2: *Box<int> = alloc<Box<int>>();
    *b1 = Box<int> { value: 100 };
    *b2 = Box<int> { value: 100 };

    if (b1 != nullptr) {
        passed = passed + 1;
        printf("PASS: b1 != nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: b1 != nullptr\n");
    }
    if (b1 != b2) {
        passed = passed + 1;
        printf("PASS: b1 != b2\n");
    } else {
        failed = failed + 1;
        printf("FAIL: b1 != b2\n");
    }

    free(cast<*void>(b1));
    free(cast<*void>(b2));

    # Test 4: String (vtable struct) pointers
    printf("\n=== String Pointers (vtable) ===\n");
    local s1: *String = alloc<String>();
    local s2: *String = alloc<String>();
    *s1 = String.new("test");
    *s2 = String.new("test");
    local s3: *String = s1;
    local sNull: *String = nullptr;

    if (s1 != nullptr) {
        passed = passed + 1;
        printf("PASS: s1 != nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: s1 != nullptr\n");
    }
    if (sNull == nullptr) {
        passed = passed + 1;
        printf("PASS: sNull == nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: sNull == nullptr\n");
    }
    if (s1 == s3) {
        passed = passed + 1;
        printf("PASS: s1 == s3 (same ptr)\n");
    } else {
        failed = failed + 1;
        printf("FAIL: s1 == s3\n");
    }
    if (s1 != s2) {
        passed = passed + 1;
        printf("PASS: s1 != s2 (diff ptr)\n");
    } else {
        failed = failed + 1;
        printf("FAIL: s1 != s2\n");
    }
    if (*s1 == *s2) {
        passed = passed + 1;
        printf("PASS: *s1 == *s2 (value eq)\n");
    } else {
        failed = failed + 1;
        printf("FAIL: *s1 == *s2\n");
    }

    s1.destroy();
    s2.destroy();

    # Test 5: Null comparisons both ways
    printf("\n=== Null Both Ways ===\n");
    local ptr: *int = nullptr;
    if (ptr == nullptr) {
        passed = passed + 1;
        printf("PASS: ptr == nullptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: ptr == nullptr\n");
    }
    if (nullptr == ptr) {
        passed = passed + 1;
        printf("PASS: nullptr == ptr\n");
    } else {
        failed = failed + 1;
        printf("FAIL: nullptr == ptr\n");
    }

    # Summary
    printf("\n=== Summary ===\n");
    printf("Passed: %d\n", passed);
    printf("Failed: %d\n", failed);

    return failed;
}
