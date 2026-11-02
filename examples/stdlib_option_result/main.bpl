import printf from "std/c.bpl";
import [Option] from "std/option.bpl";
import [Result] from "std/result.bpl";
import [OptionUnwrapError], [ResultUnwrapError] from "std/errors.bpl";

frame half(n: int) ret Option<int> {
    if ((n % 2) != 0) {
        return Option<int>.None;
    }
    return Option<int>.Some(n / 2);
}

frame main() ret int {
    local some: Option<int> = Option<int>.Some(20);
    local none: Option<int> = Option<int>.None;
    printf("expect %d\n", some.expect("needs a value"));
    try {
        none.expect("port is not configured");
    } catch (error: OptionUnwrapError) {
        printf("expect failed: %s\n", error.message);
    }
    printf("unwrapOrElse %d %d\n", some.unwrapOrElse(|| ret int {
        return -1;
    }), none.unwrapOrElse(|| ret int {
        return -1;
    }));
    local doubled: Option<long> = some.map<long>(|n: int| ret long {
        return cast<long>(n) * 2;
    });
    printf("map %ld none %d\n", doubled.unwrap(), cast<int>(none.map<long>(|n: int| ret long {
        return cast<long>(n);
    }).isNone()));
    printf("andThen %d %d\n", some.andThen<int>(|n: int| ret Option<int> {
        return half(n);
    }).unwrap(), cast<int>(Option<int>.Some(7).andThen<int>(|n: int| ret Option<int> {
        return half(n);
    }).isNone()));

    local ok: Result<int, string> = Result<int, string>.Ok(5);
    local err: Result<int, string> = Result<int, string>.Err("disk full");
    printf("result expect %d\n", ok.expect("needs success"));
    try {
        err.expect("could not save");
    } catch (error: ResultUnwrapError) {
        printf("result expect failed: %s\n", error.message);
    }
    printf("result map %d\n", ok.map<int>(|n: int| ret int {
        return n + 1;
    }).unwrap());
    local code: Result<int, int> = err.mapErr<int>(|_message: string| ret int {
        return 28;
    });
    printf("mapErr %d\n", code.unwrapErr());
    printf("ok %d %d\n", ok.ok().unwrap(), cast<int>(err.ok().isNone()));
    return 0;
}
