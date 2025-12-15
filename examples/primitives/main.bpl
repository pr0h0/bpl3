frame main() ret int {
    local a: i8 = 10;
    local b: u8 = 20;
    local c: i16 = 300;
    local d: u16 = 400;
    local e: i32 = 50000;
    local f: u32 = 60000;
    local g: i64 = 7000000000;
    local h: u64 = 8000000000;
    # Test casts
    local i: int = cast<int>(a);
    local j: long = cast<long>(e);
    local k: short = cast<short>(c);
    local l: char = cast<char>(a);
    # Test arithmetic
    local m: i32 = e + 100;
    printf("a=%d\n", cast<int>(a));
    printf("b=%d\n", cast<int>(b));
    printf("c=%d\n", cast<int>(c));
    printf("d=%d\n", cast<int>(d));
    printf("e=%d\n", e);
    printf("f=%d\n", cast<int>(f));
    printf("g=%ld\n", g);
    printf("h=%lu\n", h);
    # Test signed vs unsigned extension
    local neg: i8 = -10;
    local neg_int: int = cast<int>(neg);
    # Should be -10
    printf("neg=%d\n", neg_int);
    local uneg: u8 = 250;
    # -6 in 8-bit signed, but 250 unsigned
    local uneg_int: int = cast<int>(uneg);
    # Should be 250
    printf("uneg=%d\n", uneg_int);
    # Test implicit widening
    local n: i64 = e;
    # i32 -> i64
    printf("n=%ld\n", n);
    local o: i32 = a;
    # i8 -> i32
    printf("o=%d\n", o);
    return 0;
}
extern printf(fmt: string, ...) ret int;
