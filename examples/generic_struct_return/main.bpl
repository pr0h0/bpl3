extern printf(fmt: string, ...);

struct Box<T> {
    val: T,
}

frame make_box<T>(v: T) ret Box<T> {
    local b: Box<T>;
    b.val = v;
    return b;
}

frame main() ret int {
    local b: Box<int> = make_box<int>(50);
    printf("%d\n", b.val);

    local pi: Box<float> = make_box<float>(3.5);
    printf("%.1f\n", pi.val);

    local nested: Box<Box<int>> = make_box<Box<int>>(b);
    printf("%d\n", nested.val.val);

    local pairBox: Box<(int, int)> = make_box<(int, int)>((4, 5));
    printf("%d\n", pairBox.val.0 + pairBox.val.1);
    return 0;
}
