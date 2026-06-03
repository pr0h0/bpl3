import [printf] from "std/c.bpl";

frame main() ret int {
    local iterations: i64 = 8000000;
    local numerator: i64 = 123456789;
    local sum: i64 = 0;
    local i: i64 = 0;

    loop (i < iterations) {
        local denom: i64 = (i % 997) + 1;
        sum = sum + (numerator / denom) + (numerator % denom);
        i = i + 1;
    }

    printf("Constant numerator: %ld\n", sum);
    return 0;
}
