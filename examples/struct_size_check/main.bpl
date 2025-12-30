extern printf(fmt: string, ...);

struct A {
    x: int,
} # 4
struct B {
    x: int,
    y: int,
} # 8
struct C {
    x: int,
    y: float,
} # 4 + 4(padding) + 8 = 16 (usually)

frame main() ret int {
    printf("%d\n", sizeof<A>());
    printf("%d\n", sizeof<B>());
    # C size might vary by platform/alignment, but let's check it compiles
    local sz: int = sizeof<C>();
    if (sz >= 12) {
        printf("C >= 12\n");
    }
    return 0;
}
