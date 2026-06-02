import [printf] from "std/c.bpl";

frame inc(val: *int) {
    *val = *val + 1;
}

frame main() ret int {
    local x: int = 10;
    inc(&x);
    printf("%d\n", x);
    return 0;
}
