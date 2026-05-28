extern printf(fmt: string, ...);

frame main() ret int {
    local iterations: int = 20000000;
    local x: u32 = cast<u32>(2463534242);
    local sum: u32 = cast<u32>(0);
    local i: int = 0;

    loop (i < iterations) {
        x = x ^ (x << 13);
        x = x ^ (x >> 17);
        x = x ^ (x << 5);
        sum = sum + (x & cast<u32>(1023));
        i = i + 1;
    }

    printf("Bit twiddle: %u %u\n", x, sum);
    return 0;
}
