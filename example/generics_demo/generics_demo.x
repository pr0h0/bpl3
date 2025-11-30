import printf from "libc";
extern printf(fmt: *u8, ...);

struct Box<T> {
    value: T,
}

struct Pair<A, B> {
    first: A,
    second: B,
}

frame main() ret u8 {
    local b: Box<u64>;
    b.value = 123;
    call printf("%llu\n", b.value);

    local p: Pair<u64, Box<u64>>;
    p.first = 456;
    p.second.value = 789;

    call printf("%llu\n", p.first);
    call printf("%llu\n", p.second.value);

    return 0;
}
