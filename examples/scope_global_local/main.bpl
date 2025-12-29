extern printf(fmt: string, ...);

global X: int = 99;

frame main() ret int {
    printf("Global: %d\n", X);
    local X: int = 10;
    printf("Local: %d\n", X);
    return 0;
}
