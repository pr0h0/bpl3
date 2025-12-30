import [Option] from "std/option.bpl";

extern printf(fmt: string, ...);

frame main() ret int {
    local o: Option<int> = Option<int>.Some(42);

    match (o) {
        Option<int>.Some(v) => printf("Some %d\n", v),
        Option<int>.None => printf("None\n"),
    };
    return 0;
}
