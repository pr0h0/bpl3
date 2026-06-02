import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
}
struct Container<T> {
    box: Box<T>,
}

frame main() ret int {
    local c: Container<int>;
    c.box.val = 42;
    printf("%d\n", c.box.val);
    return 0;
}
