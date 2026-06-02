import [printf] from "std/c.bpl";

struct A {
    x: int,
}
struct B {
    y: int,
}

frame main() ret int {
    local a: A;
    a.x = 42;
    local ptrA: *A = &a;
    local ptrB: *B = cast<*B>(ptrA);
    printf("%d\n", ptrB.y);
    return 0;
}
