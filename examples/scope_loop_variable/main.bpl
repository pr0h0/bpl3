import [printf] from "std/c.bpl";

frame main() ret int {
    local i: int = 100;
    loop (i < 102) {
        local i: int = 0; # Shadowing loop condition var? No, loop var is outer
        printf("Inner i: %d\n", i);
        break;
    }
    printf("Outer i: %d\n", i);
    return 0;
}
