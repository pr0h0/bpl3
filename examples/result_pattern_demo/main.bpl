import [printf] from "std/c.bpl";

enum Result<T, E> {
    Ok(T),
    Err(E),
}

frame safeDivide(a: int, b: int) ret Result<int, string> {
    if (b == 0) {
        return Result<int, string>.Err("Division by zero");
    }
    return Result<int, string>.Ok(a / b);
}

frame main() ret int {
    local res1: Result<int, string> = safeDivide(10, 2);

    match (res1) {
        Result<int, string>.Ok(val) => {
            printf("Success: %d\n", val);
        },
        Result<int, string>.Err(msg) => {
            printf("Error: %s\n", msg);
        },
    };

    local res2: Result<int, string> = safeDivide(10, 0);

    if (match<Result.Err>(res2)) {
        printf("Got expected error\n");
    }
    return 0;
}
