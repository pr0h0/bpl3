import [Result] from "std";
import [printf] from "std/c.bpl";

frame main() ret int {
    local ok: Result<int, string> = Result<int, string>.Ok(42);
    local err: Result<int, string> = Result<int, string>.Err("Something went wrong");

    if (ok.isOk()) {
        printf("ok is Ok: %d\n", ok.unwrap());
    } else {
        printf("ok is NOT Ok\n");
        return 1;
    }

    if (err.isErr()) {
        printf("err is Err: %s\n", err.unwrapErr());
    } else {
        printf("err is NOT Err\n");
        return 1;
    }

    local val: int = ok.unwrapOr(0);
    if (val == 42) {
        printf("unwrapOr works for Ok\n");
    } else {
        printf("unwrapOr failed for Ok\n");
        return 1;
    }

    local def: int = err.unwrapOr(100);
    if (def == 100) {
        printf("unwrapOr works for Err\n");
    } else {
        printf("unwrapOr failed for Err\n");
        return 1;
    }

    # Test equality
    local ok2: Result<int, string> = Result<int, string>.Ok(42);
    if (ok == ok2) {
        printf("Equality works\n");
    } else {
        printf("Equality failed\n");
        return 1;
    }

    if (ok != err) {
        printf("Inequality works\n");
    } else {
        printf("Inequality failed\n");
        return 1;
    }

    return 0;
}
