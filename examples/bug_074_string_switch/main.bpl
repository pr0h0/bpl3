extern printf(fmt: string, ...);

frame main() {
    local color: string = "red";

    switch (color) {
        case "red": {
            printf("Color is red\n");
        }
        case "green": {
            printf("Color is green\n");
        }
        case "blue": {
            printf("Color is blue\n");
        }
        default: {
            printf("Unknown color\n");
        }
    }
}
