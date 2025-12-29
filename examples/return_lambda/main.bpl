extern printf(fmt: string, ...);

frame getAdder(x: int) ret Lambda<int>(int) {
    return |y: int| ret int {
        return x + y;
    };
}

frame main() ret int {
    local add5: Lambda<int>(int) = getAdder(5);
    printf("Result: %d\n", add5(10));
    return 0;
}
