import [printf] from "std/c.bpl";

struct A {
    a: int,
}
struct B: A {
    b: int,
}
struct C: B {
    c: int,
}
struct D: C {
    d: int,
}

frame main() ret int {
    local obj: D;
    obj.a = 1;
    obj.b = 2;
    obj.c = 3;
    obj.d = 4;
    printf("%d %d %d %d\n", obj.a, obj.b, obj.c, obj.d);
    return 0;
}
