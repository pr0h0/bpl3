# Test match<Type> with enum variants
# Demonstrates enum variant type checking at runtime

import [Option] from "std/option.bpl";

extern printf(fmt: string, ...) ret int;

enum Result<T, E> {
    Ok(T),
    Err(E),
}

# Function demonstrating enum variant type checking with Option
frame checkOption(opt: Option<int>) ret int {
    if (match<Option.Some>(opt)) {
        printf("Option is Some\n");
        return 1;
    } else {
        printf("Option is None\n");
        return 0;
    }
}

# Function demonstrating enum variant type checking with Result
frame checkResult(res: Result<int, string>) ret int {
    if (match<Result.Ok>(res)) {
        printf("Result is Ok\n");
        return 1;
    } else {
        printf("Result is Err\n");
        return 0;
    }
}

frame main() ret int {
    # Test Option enum variant matching
    local someVal: Option<int> = Option<int>.Some(42);
    local noneVal: Option<int> = Option<int>.None;

    local _result1: int = checkOption(someVal);
    local _result2: int = checkOption(noneVal);

    # Test Result enum variant matching
    local okVal: Result<int, string> = Result<int, string>.Ok(100);
    local errVal: Result<int, string> = Result<int, string>.Err("error");

    local _result3: int = checkResult(okVal);
    local _result4: int = checkResult(errVal);

    return 0;
}
