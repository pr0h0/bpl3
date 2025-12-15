extern printf(fmt: string, ...);
frame main() ret int {
    printf("10 %% 3 = %d\n", 10 % 3);
    return 0;
}
