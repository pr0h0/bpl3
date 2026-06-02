import [Option] from "std/option.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    local o: Option<int> = Option<int>.Some(42);

    match (o) {
        Option<int>.Some(v) => printf("Some %d\n", v),
        Option<int>.None => printf("None\n"),
    };
    return 0;
}
