extern printf(fmt: string, ...);

frame takeConst(const x: int) {
    printf("x is %d\n", x);
    # x = 10; # This would fail
}

frame takeFunc(f: Lambda<void>(const int)) {
    f(42);
}

frame main() ret int {
    local x: int = 10;
    takeConst(x);

    local f: Lambda<void>(const int) = |val: const int| {
        printf("Lambda received %d\n", val);
        # val = 20; # This would fail
    };

    takeFunc(f);

    local const c: int = 100;
    local lambda: Lambda<void>() = || {
        printf("Captured const c: %d\n", c);
        # c = 200; # This would fail
    };
    lambda();

    return 0;
}
