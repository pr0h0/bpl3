import [printf] from "std/c.bpl";

struct Pair<K, V> {
    key: K,
    val: V,
}

frame main() ret int {
    local p: Pair<int, bool>;
    p.key = 1;
    p.val = true;

    printf("%d\n", p.key);
    if (p.val) {
        printf("True\n");
    }
    return 0;
}
