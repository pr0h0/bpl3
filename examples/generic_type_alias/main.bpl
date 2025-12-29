extern printf(fmt: string, ...);

type IntBox = Box<int>;
struct Box<T> {
    val: T,
}

frame main() ret int {
    local b: IntBox;
    b.val = 77;
    printf("%d\n", b.val);
    return 0;
}
