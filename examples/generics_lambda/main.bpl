import [printf] from "std/c.bpl";

frame testLambda<T>(val: T) {
    # Use Lambda type instead of Func
    local f: Lambda<T>(T) = |x: T| ret T {
        return x;
    };
    local res: T = f(val);
    # Use res to avoid unused variable error
    local _unused: T = res;

    # We can't easily print T, but we can cast if we know the type
    # or just rely on side effects if we had them.
    # Here we just assume it works if it compiles and runs.
    printf("Lambda executed\n");
}

frame main() ret int {
    testLambda<int>(42);
    testLambda<float>(3.14);
    return 0;
}
