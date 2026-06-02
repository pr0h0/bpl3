import [printf] from "std/c.bpl";

frame process(x: int, const y: int) {
    # y = 10; # Should be error
    printf("x: %d, y: %d\n", x, y);
}

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local const a: int = 10;
    # a = 20; # Should be error
    printf("a: %d\n", a);

    local const p: Point = Point { x: 1, y: 2 };
    # p.x = 3; # Should be error
    printf("p.x: %d\n", p.x);

    local mut_p: Point = Point { x: 10, y: 20 };
    mut_p.x = 30; # OK
    printf("mut_p.x: %d\n", mut_p.x);

    local ptr: *Point = &mut_p;
    ptr.x = 40; # OK
    printf("ptr.x: %d\n", ptr.x);

    local const c_ptr: *Point = &mut_p;
    c_ptr.x = 50; # OK (pointer is const, but pointee is mutable)
    # c_ptr = &p; # Should be error
    printf("c_ptr.x: %d\n", c_ptr.x);

    process(1, 2);

    return 0;
}
