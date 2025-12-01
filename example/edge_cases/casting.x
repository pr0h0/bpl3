import printf from "libc";

frame main() ret u64 {
    call printf("--- Casting Tests ---\n");

    # Float to Int
    local f: f64 = 123.456;
    local i: u64 = f;
    call printf("f64 to u64: %f -> %ld\n", f, i);

    # Int to Float
    local j: u64 = 987;
    local g: f64 = j;
    call printf("u64 to f64: %ld -> %f\n", j, g);

    # f32 to f64
    local small_f: f32 = 3.14;
    local big_f: f64 = small_f;
    call printf("f32 to f64: %f -> %f\n", small_f, big_f);

    # f64 to f32
    local big_f2: f64 = 6.28;
    local small_f2: f32 = big_f2;
    call printf("f64 to f32: %f -> %f\n", big_f2, small_f2);

    # Truncation (u64 -> u8)
    local big_int: u64 = 0x1234567890ABCDEF;
    local small_int: u8 = big_int;
    call printf("u64 to u8 (trunc): %lx -> %x\n", big_int, small_int);

    return 0;
}
