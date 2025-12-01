import printf from "libc";

struct ArrayWrapper<T> {
    data: T[5],
}

struct PointerWrapper<T> {
    ptr: *T,
}

struct Pair<A, B> {
    first: A,
    second: B,
}

struct Triple<A, B, C> {
    p: Pair<A, B>,
    third: C,
}

frame main() ret u64 {
    # 1. Generic with Array
    local aw: ArrayWrapper<u64>;
    aw.data[0] = 10;
    aw.data[1] = 20;
    aw.data[4] = 50;
    call printf("ArrayWrapper: %lu, %lu, %lu\n", aw.data[0], aw.data[1], aw.data[4]);

    # 2. Generic with Pointer
    local val: u64 = 123;
    local pw: PointerWrapper<u64>;
    pw.ptr = &val;
    call printf("PointerWrapper: %lu\n", *pw.ptr);

    # 3. Mixed Generics
    local t: Triple<u8, u16, u32>;
    t.p.first = 1;
    t.p.second = 2;
    t.third = 3;
    call printf("Triple: %d, %d, %d\n", t.p.first, t.p.second, t.third);

    # 4. Generic Struct with Generic Struct Field
    local p1: Pair<u64, u64>;
    p1.first = 100;
    p1.second = 200;

    local p2: Pair<Pair<u64, u64>, u64>;
    p2.first = p1;
    p2.second = 300;

    call printf("Nested Pair: %lu, %lu, %lu\n", p2.first.first, p2.first.second, p2.second);
    return 0;
}
