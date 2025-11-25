import printf;

frame main() ret u64 {
    local a: u64 = 10;
    local b: u64 = 20;

    call printf("Testing else if:\n");
    call printf("a = %d, b = %d\n", a, b);

    if a > b {
        call printf("a > b\n");
    } else if a == b {
        call printf("a == b\n");
    } else {
        call printf("a < b\n");
    }

    a = 20;
    call printf("a = %d, b = %d\n", a, b);
    if a > b {
        call printf("a > b\n");
    } else if a == b {
        call printf("a == b\n");
    } else {
        call printf("a < b\n");
    }

    a = 30;
    call printf("a = %d, b = %d\n", a, b);
    if a > b {
        call printf("a > b\n");
    } else if a == b {
        call printf("a == b\n");
    } else {
        call printf("a < b\n");
    }

    # Nested else if
    local x: u64 = 5;
    if x == 1 {
        call printf("x is 1\n");
    } else if x == 2 {
        call printf("x is 2\n");
    } else if x == 3 {
        call printf("x is 3\n");
    } else if x == 4 {
        call printf("x is 4\n");
    } else if x == 5 {
        call printf("x is 5\n");
    } else {
        call printf("x is something else\n");
    }

    return 0;
}
