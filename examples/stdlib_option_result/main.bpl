import [Option] from "std/option.bpl";
import [Result] from "std/result.bpl";
import [IO] from "std/io.bpl";
import [OptionUnwrapError] from "std/errors.bpl";

frame demoOption() {
    IO.log("=== Option Demo ===");
    local o1: Option<int> = Option<int>.Some(42);
    local o2: Option<int> = Option<int>.None;
    IO.printIntLn(o1.unwrap());
    try {
        local v: int = o2.unwrap();
        IO.printIntLn(v);
    } catch (e: OptionUnwrapError) {
        IO.log("Caught Option unwrap error");
    }
    IO.printIntLn(o2.unwrapOr(7));
}

frame demoResult() {
    IO.log("=== Result Demo ===");
    local r1: Result<int, int> = Result<int, int>.Ok(10);
    local r2: Result<int, int> = Result<int, int>.Err(5);
    IO.printIntLn(r1.unwrap());
    try {
        local v: int = r2.unwrap();
        IO.printIntLn(v);
    } catch (e_int: int) {
        IO.log("Caught Result error: 5");
    }
    IO.printIntLn(r2.unwrapOr(99));
}

frame main() ret int {
    demoOption();
    demoResult();
    return 0;
}
