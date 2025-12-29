extern printf(fmt: string, ...);

enum Option<T> {
    Some(T),
    None,
}

frame main() ret int {
    local o1: Option<int> = Option<int>.Some(10);
    local o2: Option<int> = Option<int>.None;

    match (o1) {
        Option<int>.Some(v) => printf("Some: %d\n", v),
        Option<int>.None => printf("None\n"),
    };
    match (o2) {
        Option<int>.Some(v) => printf("Some: %d\n", v),
        Option<int>.None => printf("None\n"),
    };
    return 0;
}
