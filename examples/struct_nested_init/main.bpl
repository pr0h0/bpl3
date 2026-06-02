import [printf] from "std/c.bpl";

struct Inner {
    x: int,
}
struct Outer {
    i: Inner,
}

frame main() ret int {
    local o: Outer;
    o.i.x = 5;
    printf("%d\n", o.i.x);
    return 0;
}
