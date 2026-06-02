import [printf] from "std/c.bpl";

frame test_prefix(const a: int) {
    printf("prefix: %d\n", a);
    # a = 10; # Should be error
}

frame test_postfix(const a: int) {
    printf("postfix: %d\n", a);
    # a = 10; # Should be error
}

frame test_mixed(const a: int, const b: int) {
    printf("mixed: %d, %d\n", a, b);
}

frame main() ret int {
    test_prefix(1);
    test_postfix(2);
    test_mixed(3, 4);
    return 0;
}
