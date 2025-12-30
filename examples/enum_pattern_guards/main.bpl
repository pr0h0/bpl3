# Test pattern guards in match expressions
import [Option] from "std/option.bpl";

extern printf(fmt: string, ...) ret int;

frame classifyValue(opt: Option<int>) ret string {
    return match (opt) {
        Option<int>.Some(x) if x > 0 => "positive",
        Option<int>.Some(x) if x < 0 => "negative",
        Option<int>.Some(x) => "zero",
        Option<int>.None => "none",
    };
}

frame main() ret int {
    local pos: Option<int> = Option<int>.Some(42);
    local neg: Option<int> = Option<int>.Some(-5);
    local zero: Option<int> = Option<int>.Some(0);
    local none: Option<int> = Option<int>.None;

    printf("42: %s\n", classifyValue(pos));
    printf("-5: %s\n", classifyValue(neg));
    printf("0: %s\n", classifyValue(zero));
    printf("None: %s\n", classifyValue(none));

    return 0;
}
