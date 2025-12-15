extern printf(fmt: string, ...);
global G: int = 100;
frame main() ret int {
    printf("Global: %d\n", G);
    G = 200;
    printf("Global Modified: %d\n", G);
    return 0;
}
