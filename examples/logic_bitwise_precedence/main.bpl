extern printf(fmt: string, ...);

frame main() ret int {
    # (1 | 2) & 3 = 3 & 3 = 3
    # 1 | (2 & 3) = 1 | 2 = 3
    # 1 << 2 + 1 = 1 << 3 = 8 (if + higher than <<)

    local res1: int = 1 | (2 & 3);
    local res2: int = 1 << (2 + 1);

    printf("res1: %d\n", res1);
    printf("res2: %d\n", res2);
    return 0;
}
