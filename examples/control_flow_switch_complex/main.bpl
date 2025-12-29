extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    switch (x * 2) {
        case 20: {
            printf("Twenty\n");
        }
        case 10: {
            printf("Ten\n");
        }
        default: {
            printf("Default\n");
        }
    }
    return 0;
}
