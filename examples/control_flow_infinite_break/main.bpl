extern printf(fmt: string, ...);

frame main() ret int {
    local count: int = 0;
    loop {
        count = count + 1;
        if (count > 3) {
            break;
        }
        printf("%d\n", count);
    }
    return 0;
}
