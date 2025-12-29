extern printf(fmt: string, ...);

frame main() ret int {
    local i: int = 0;
    # Simulate while loop
    loop {
        if (i >= 3) {
            break;
        }
        printf("%d\n", i);
        i = i + 1;
    }
    return 0;
}
