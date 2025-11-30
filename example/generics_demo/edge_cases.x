import printf from "libc";
extern printf(fmt: *u8, ...);

struct Container<T> {
    data: T,
}

struct Wrapper<U> {
    container: Container<U>,
}

struct ArrayWrapper<T> {
    data: T[5],
}

struct PointerWrapper<T> {
    ptr: *T,
}

struct Multi<A, B, C> {
    a: A,
    b: B,
    c: C,
}

frame main() ret u8 {
    local w: Wrapper<Container<Multi<u64, u8, u16>>>;
    w.container.data.data.a = 111;
    call printf("Nested: %llu\n", w.container.data.data.a);

    local aw: ArrayWrapper<u64>;
    aw.data[0] = 222;
    aw.data[4] = 333;
    call printf("Array[0]: %llu\n", aw.data[0]);
    call printf("Array[4]: %llu\n", aw.data[4]);

    local val: u64 = 444;
    local pw: PointerWrapper<u64>;
    pw.ptr = &val;
    call printf("Pointer: %llu\n", *pw.ptr);

    local m: Multi<u64, u8, u32>;
    m.a = 555;
    m.b = 66;
    m.c = 7777;
    call printf("Multi: %llu, %u, %u\n", m.a, m.b, m.c);

    return 0;
}
