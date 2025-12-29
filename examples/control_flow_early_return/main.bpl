extern printf(fmt: string, ...);

frame check(x: int) ret int {
    if (x < 0) {
        return -1;
    }
    if (x == 0) {
        return 0;
    }
    return 1;
}

frame main() ret int {
    printf("%d\n", check(-5));
    printf("%d\n", check(0));
    printf("%d\n", check(5));
    return 0;
}
