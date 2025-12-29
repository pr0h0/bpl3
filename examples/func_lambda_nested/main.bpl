extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    local f: Lambda<int>(int) = |y: int| ret int {
        local g: Lambda<int>(int) = |z: int| ret int {
            return x + y + z;
        };
        return g(5);
    };
    printf("%d\n", f(20)); # 10 + 20 + 5 = 35
    return 0;
}
