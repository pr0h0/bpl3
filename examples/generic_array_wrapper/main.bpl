extern printf(fmt: string, ...);

struct ArrayWrapper<T> {
    data: T[3],
}

frame main() ret int {
    local w: ArrayWrapper<int>;
    w.data[0] = 1;
    w.data[1] = 2;
    w.data[2] = 3;
    printf("%d\n", w.data[2]);
    return 0;
}
