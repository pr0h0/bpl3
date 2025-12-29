extern printf(fmt: string, ...);

frame apply(f: Lambda<int>(int), v: int) ret int {
    return f(v);
}

frame main() ret int {
    local res: int = apply(|x: int| ret int {
        return x * x;
    }, 5);
    printf("Result: %d\n", res);
    return 0;
}
