extern printf(fmt: string, ...);

frame main() ret int {
    local b: bool = true;
    if (!!b) {
        printf("Double not true\n");
    }
    if (!!b) {
        printf("Not not true\n");
    }
    return 0;
}
