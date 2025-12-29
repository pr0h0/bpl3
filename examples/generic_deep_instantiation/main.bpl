extern printf(fmt: string, ...);

struct A<T> {
    val: T,
}
struct B<T> {
    a: A<T>,
}
struct C<T> {
    b: B<T>,
}

frame main() ret int {
    local c: C<int>;
    c.b.a.val = 99;
    printf("%d\n", c.b.a.val);
    return 0;
}
