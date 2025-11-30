struct Wrapper<T> {
    value: T,
}

struct Container<T> {
    item: T,
}

struct Multi<A, B, C> {
    a: A,
    b: B,
    c: C,
}

global test: Wrapper<Container<Multi<u64, u8, u16>>>;
global test2: Wrapper<Container<Multi<u64, u8, u16>>>;

export [Wrapper];
export [Container];
export [Multi];
