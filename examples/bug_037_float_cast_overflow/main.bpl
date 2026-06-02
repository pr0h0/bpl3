import [printf] from "std/c.bpl";

frame main() ret int {
    # TODO: Why do we get max int on overflow?
    # 1e20 = 100000000000000000000.0
    local large_pos: float = 100000000000000000000.0;
    local large_neg: float = -100000000000000000000.0;

    local i_pos: int = cast<int>(large_pos);
    local i_neg: int = cast<int>(large_neg);

    printf("1e20 as int: %d\n", i_pos);
    printf("-1e20 as int: %d\n", i_neg);

    return 0;
}
