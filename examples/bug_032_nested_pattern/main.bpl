import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local inner: Option<int> = Option<int>.Some(42);
    local opt: Option<Option<int>> = Option<Option<int>>.Some(inner);

    match (opt) {
        Option<Option<int>>.Some(val) => {
            match (val) {
                Option<int>.Some(x) => {
                    printf("Value: %d\n", x);
                },
                Option<int>.None => {
                    printf("Inner None\n");
                },
            };
        },
        Option<Option<int>>.None => {
            printf("Outer None\n");
        },
    };
    return 0;
}
