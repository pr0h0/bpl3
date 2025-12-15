extern printf(fmt: string, ...);
frame main() ret int {
    local i: int = 0;
    loop {
        if (i >= 5) {
            break;
        }
        i = i + 1;
        if ((i % 2) == 0) {
            continue;
        }
        printf("%d ", i);
    }
    printf("\n");
    return 0;
}
