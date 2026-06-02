import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
    frame set(this: *Box<T>, v: T) {
        this.val = v;
    }
}

frame main() ret int {
    local b: Box<int>;
    b.set(100);
    printf("%d\n", b.val);
    return 0;
}
