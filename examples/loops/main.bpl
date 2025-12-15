extern printf(fmt: string, ...);
frame main() ret int {
    local i: int = 0;
    loop {
        if (i >= 5) {
            break;
        }
        printf("%d ", i);
        i = i + 1;
    }
    printf("\n");
    return 0;
}
