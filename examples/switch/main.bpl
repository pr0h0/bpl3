extern printf(fmt: string, ...);
frame main() ret int {
    local i: int = 2;
    switch (i) {
        case 1: {
            printf("One\n");
        }
        case 2: {
            printf("Two\n");
        }
        default: {
            printf("Other\n");
        }
    }
    return 0;
}
