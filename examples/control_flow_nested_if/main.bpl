import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 10;
    local y: int = 20;

    if (x > 5) {
        if (y > 15) {
            printf("Both > threshold\n");
        } else {
            printf("Only x > threshold\n");
        }
    } else {
        printf("x <= threshold\n");
    }
    return 0;
}
