extern printf(fmt: string, ...);
frame main() ret int {
    local i: int = 65;
    local c: char = cast<char>(i);
    printf("Int: %d, Char: %c\n", i, c);
    local f: float = 3.14;
    local fi: int = cast<int>(f);
    printf("Float: %f, Int: %d\n", f, fi);
    return 0;
}
