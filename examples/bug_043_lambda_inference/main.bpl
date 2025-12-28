frame main() ret int {
    local f: Func<int>(int) = |x: int| {
        return x;
    };
    f(10);
    return 0;
}
