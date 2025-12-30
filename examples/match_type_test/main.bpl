import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local opt: Option<int> = Option<int>.Some(42);

    if (match<Option.Some>(opt)) {
        printf("Is Some\n");
    }
    if (!match<Option.None>(opt)) {
        printf("Is not None\n");
    }
    return 0;
}
