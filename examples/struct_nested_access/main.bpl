import [printf] from "std/c.bpl";

struct A {
    val: int,
}
struct B {
    a: A,
}
struct C {
    b: B,
}

frame main() ret int {
    local c: C;
    c.b.a.val = 42;
    printf("%d\n", c.b.a.val);
    return 0;
}
