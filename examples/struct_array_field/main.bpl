extern printf(fmt: string, ...);

struct Vector {
    data: int[3],
}

frame main() ret int {
    local v: Vector;
    v.data[0] = 10;
    v.data[1] = 20;
    v.data[2] = 30;
    printf("%d %d %d\n", v.data[0], v.data[1], v.data[2]);
    return 0;
}
