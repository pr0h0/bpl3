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
    return 0;
}
