extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 1;
    local y: int = 2;

    switch (x) {
        case 1: {
            switch (y) {
                case 2: {
                    printf("One Two\n");
                    break;
                }
                default: {
                    printf("One Other\n");
                    break;
                }
            }
            break;
        }
        default: {
            printf("Other\n");
            break;
        }
    }
    return 0;
}
