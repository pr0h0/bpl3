import [printf] from "std/c.bpl";

frame main() ret int {
    # 1. Simple lambda
    local f: Lambda<int>(int) = |x: int| ret int {
        return x * 2;
    };
    printf("f(10) = %d\n", f(10));

    # 2. Lambda with no args
    local g: Lambda<int>() = || ret int {
        return 42;
    };
    printf("g() = %d\n", g());

    # 3. Lambda with multiple args
    local h: Lambda<int>(int, int) = |a: int, b: int| ret int {
        return a + b;
    };
    printf("h(10, 20) = %d\n", h(10, 20));

    # 4. Passing lambda to function
    apply(|x: int| ret int {
        return x * x;
    }, 5);

    # 5. Capturing variables
    local capture_me: int = 100;
    local capturer: Lambda<int>(int) = |x: int| ret int {
        return x + capture_me;
    };
    printf("capturer(10) = %d\n", capturer(10));

    return 0;
}

frame apply(func: Lambda<int>(int), val: int) {
    printf("apply(func, %d) = %d\n", val, func(val));
}
