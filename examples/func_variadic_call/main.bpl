extern printf(fmt: string, ...);

frame main() ret int {
    printf("Int: %d, Float: %.1f, String: %s\n", 1, 2.5, "test");
    return 0;
}
