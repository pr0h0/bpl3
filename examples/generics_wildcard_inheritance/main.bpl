import [printf] from "std/c.bpl";

struct Base<T> {
    val: T,
    base_id: int,
}

struct Derived<T>: Base<T> {
    extra: int,
}

# Accepts any Base<T> (wildcard)
frame process_base<B: Base>(b: B) {
    printf("Base ID: %d\n", b.base_id);
}

frame main() {
    local d: Derived<int>;
    d.base_id = 99;
    d.extra = 123;

    # Derived<int> inherits Base<int>.
    # Derived<int> should satisfy constraint Base (wildcard)
    process_base<Derived<int>>(d);
}
