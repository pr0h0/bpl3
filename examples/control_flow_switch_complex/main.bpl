import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 10;
    switch (x * 2) {
        case 20: {
            printf("Twenty\n");
            break;
        }
        case 10: {
            printf("Ten\n");
            break;
        }
        default: {
            printf("Default\n");
            break;
        }
    }
    return 0;
}
