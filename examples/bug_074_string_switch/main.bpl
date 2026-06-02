import [printf] from "std/c.bpl";

frame main() {
    local color: string = "red";

    switch (color) {
        case "red": {
            printf("Color is red\n");
            break;
        }
        case "green": {
            printf("Color is green\n");
            break;
        }
        case "blue": {
            printf("Color is blue\n");
            break;
        }
        default: {
            printf("Unknown color\n");
            break;
        }
    }
}
