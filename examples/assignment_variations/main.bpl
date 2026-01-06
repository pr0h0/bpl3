extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame print_point(name: string, p: *Point) {
    if (p == nullptr) {
        printf("%s: %p -> nullptr\n", name, p);
    } else {
        printf("%s: %p -> { x: %d, y: %d }\n", name, p, p.x, p.y);
    }
}

frame print_ptr_info(name: string, ptr_addr: **Point) {
    local val: *Point = *ptr_addr;
    printf("%s variable addr: %p, holds value: %p\n", name, ptr_addr, val);
}

frame main() ret int {
    printf("--- Stack Objects ---\n");

    # 1. Uninitialized Stack Object
    # Memory is allocated on stack but not cleared. Values are undefined (garbage).
    local s1: Point;
    printf("s1 (uninit) addr: %p\n", &s1);
    # We print values, but they are unpredictable.
    # printf("s1 values: { x: %d, y: %d }\n", s1.x, s1.y);
    printf("s1 values: { x: <garbage>, y: <garbage> }\n");

    # 2. Zero Initialized Stack Object (Explicit)
    local s2: Point = 0;
    printf("s2 (zero-init) addr: %p\n", &s2);
    printf("s2 values: { x: %d, y: %d }\n", s2.x, s2.y);

    # 3. Value Initialized Stack Object
    local s3: Point = Point { x: 10, y: 20 };
    printf("s3 (value-init) addr: %p\n", &s3);
    printf("s3 values: { x: %d, y: %d }\n", s3.x, s3.y);

    printf("\n--- Pointers ---\n");

    # 4. Uninitialized Pointer
    # Holds garbage address.
    local p1: *Point;
    print_ptr_info("p1 (uninit)", &p1);

    # 5. Nullptr Initialized Pointer
    local p2: *Point = nullptr;
    print_ptr_info("p2 (nullptr)", &p2);
    print_point("p2", p2);

    # 6. Pointer to Stack Object
    local p3: *Point = &s3;
    print_ptr_info("p3 (&s3)", &p3);
    print_point("p3", p3);

    # 7. Pointer assigned from Literal (Implicit stack allocation)
    # This creates a temporary stack object and assigns its address to p4.
    local p4: *Point = Point { x: 50, y: 60 };
    print_ptr_info("p4 (literal)", &p4);
    print_point("p4", p4);

    printf("\n--- Zero Initialization Tests ---\n");

    local arr: int[3] = 0;
    printf("arr: [%d, %d, %d]\n", arr[0], arr[1], arr[2]);

    local tup: (int, float) = 0;
    local (t1: int, t2: float) = tup;
    printf("tup: (%d, %.1f)\n", t1, t2);

    local f: float = 0;
    printf("float: %.1f\n", f);

    local b: bool = 0;
    printf("bool: %s\n", b ? "true" : "false");

    local c: char = 0;
    printf("char: %d\n", cast<int>(c));

    return 0;
}
