import [printf] from "std/c.bpl";
frame main() ret int {
    local i: int = 2;
    switch (i) {
        case 1: {
            printf("One\n");
            break;
        }
        case 2: {
            printf("Two\n");
            break;
        }
        default: {
            printf("Other\n");
            break;
        }
    }
    return 0;
}
