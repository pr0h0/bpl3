frame main() ret int {
    local f: Lambda<int>(int) = |x: int| {
        return x;
    };
    f(10);
    return 0;
}
