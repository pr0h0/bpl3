extern printf(fmt: string, ...);

@[noinline]
frame mix(value: int, i: int) ret int {
    return ((value * 17) + (i % 1009) + 23) % 1000003;
}

frame main() ret int {
    local iterations: int = 20000000;
    local value: int = 7;
    local i: int = 0;

    loop (i < iterations) {
        value = mix(value, i);
        i = i + 1;
    }

    printf("Call sum: %d\n", value);
    return 0;
}
