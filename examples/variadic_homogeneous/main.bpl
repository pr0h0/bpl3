extern printf(fmt: *char, ...);

frame sum(args: ...int, count: int) ret int {
    local total: int = 0;
    loop (local i: int = 0; i < count; i++) {
        total = total + args[i];
    }
    return total;
}

frame main() ret int {
    local s: int = sum(1, 2, 3, 4, 5);
    printf("Sum: %d\n", s);
    if (s == 15) {
        printf("Success\n");
        return 0;
    }
    printf("Failure\n");
    return 1;
}
