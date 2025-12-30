# Test match<Type>(value) for runtime type checking
import [Option] from "std/option.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local opt1: Option<int> = Option<int>.Some(42);
    local opt2: Option<int> = Option<int>.None;

    # Check if opt1 is Some variant
    if (match<Option.Some>(opt1)) {
        printf("opt1 is Some\n");
    } else {
        printf("opt1 is not Some\n");
    }

    # Check if opt2 is Some variant
    if (match<Option.Some>(opt2)) {
        printf("opt2 is Some\n");
    } else {
        printf("opt2 is not Some\n");
    }

    # Check if opt2 is None variant
    if (match<Option.None>(opt2)) {
        printf("opt2 is None\n");
    }
    return 0;
}
