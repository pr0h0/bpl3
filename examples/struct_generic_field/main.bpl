import [printf] from "std/c.bpl";

struct Wrapper<T> {
    val: T,
}

frame main() ret int {
    local w1: Wrapper<int>;
    w1.val = 10;
    local w2: Wrapper<bool>;
    w2.val = true;

    printf("%d\n", w1.val);
    if (w2.val) {
        printf("True\n");
    }
    return 0;
}
