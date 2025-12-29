extern printf(fmt: string, ...);

global VAL: int = 50;

frame test(VAL: int) {
    printf("Param: %d\n", VAL);
}

frame main() ret int {
    test(10);
    printf("Global: %d\n", VAL);
    return 0;
}
