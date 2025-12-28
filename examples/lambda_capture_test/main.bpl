extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    # 1. Primitive Capture (Copy)
    local x: int = 5;
    local cb_int: Lambda<int>() = || ret int {
        return x;
    };
    x = 10;
    printf("Int Capture: %d\n", cb_int());

    # 2. Struct Capture (Copy)
    local p: Point;
    p.x = 100;
    p.y = 200;

    local cb_struct: Lambda<int>() = || ret int {
        return p.x;
    };

    p.x = 300;
    printf("Struct Capture: %d\n", cb_struct());

    # 3. Pointer Capture (Reference-like behavior)
    local val: int = 1000;
    local ptr: *int = &val;

    local cb_ptr: Lambda<int>() = || ret int {
        return *ptr;
    };

    val = 2000; # Change value pointed to
    printf("Pointer Capture (Value): %d\n", cb_ptr());

    local val2: int = 3000;
    ptr = &val2; # Change pointer itself
    printf("Pointer Capture (Ptr Change): %d\n", cb_ptr());

    return 0;
}
