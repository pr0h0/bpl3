extern printf(fmt: string, ...);

struct A {
    frame foo(this: A) {
        printf("A\n");
    }
    frame foo(this: A, x: int) {
        printf("A int %d\n", x);
    }
}

frame main() ret int {
    local a: A;
    a.foo();
    a.foo(1);
    return 0;
}
