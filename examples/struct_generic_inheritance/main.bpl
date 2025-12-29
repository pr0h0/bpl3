extern printf(fmt: string, ...);

struct Base<T> {
    val: T,
}
struct Derived<T>: Base<T> {
    extra: int,
}

frame main() ret int {
    local d: Derived<int>;
    d.val = 10;
    d.extra = 20;
    printf("%d %d\n", d.val, d.extra);
    return 0;
}
