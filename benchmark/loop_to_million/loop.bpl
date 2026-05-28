extern printf(f: string, ...) ret int;

frame main() ret int {
    local i: int = 0;
    local sum: int = 0;
    local iterations: int = 20000000;

    loop (i < iterations) {
        sum = ((sum * 3) + i) % 1000003;
        i = i + 1;
    }

    printf("Loop sum: %d\n", sum);
    return 0;
}
