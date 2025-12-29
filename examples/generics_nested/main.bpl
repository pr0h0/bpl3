extern printf(fmt: string, ...);

struct Box<T> {
    value: T,
}

struct Pair<K, V> {
    first: K,
    second: V,
}

frame main() ret int {
    local b: Box<Box<int>>;
    local inner: Box<int>;
    inner.value = 42;
    b.value = inner;

    printf("Nested: %d\n", b.value.value);

    local p: Pair<int, float>;
    p.first = 1;
    p.second = 2.5;
    printf("Pair: %d, %.2f\n", p.first, p.second);

    return 0;
}
