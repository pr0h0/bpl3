import [printf] from "std/c.bpl";

frame main() ret int {
    local i: int = 0;
    # Simulate do-while
    loop {
        printf("%d\n", i);
        i = i + 1;
        if (i >= 3) {
            break;
        }
    }
    return 0;
}
