import [printf] from "std/c.bpl";
frame main() ret int {
    printf("10 %% 3 = %d\n", 10 % 3);
    return 0;
}
