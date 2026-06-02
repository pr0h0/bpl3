import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    printf("=== Value Types vs Pointers ===\n\n");

    # 1. Value Type
    printf("1. Value Type (Point)\n");
    local p1: Point;
    p1.x = 10;
    p1.y = 20;
    printf("p1: (%d, %d)\n", p1.x, p1.y);

    # Value types cannot be nullptr
    # local p2: Point = nullptr; # This would be a compile error

    # Copying value types creates a copy
    local p2: Point = p1;
    p2.x = 30;
    printf("p1 after modifying p2: (%d, %d) (should be 10, 20)\n", p1.x, p1.y);
    printf("p2: (%d, %d) (should be 30, 20)\n", p2.x, p2.y);

    # 2. Pointer Type
    printf("\n2. Pointer Type (*Point)\n");
    local ptr1: *Point = &p1;
    printf("ptr1 points to p1: (%d, %d)\n", ptr1.x, ptr1.y);

    # Pointers can be nullptr
    local ptr2: *Point = nullptr;
    if (ptr2 == nullptr) {
        printf("ptr2 is nullptr\n");
    }
    # Copying pointers copies the reference
    ptr2 = ptr1;
    ptr2.y = 40;
    printf("p1 after modifying via ptr2: (%d, %d) (should be 10, 40)\n", p1.x, p1.y);

    return 0;
}
