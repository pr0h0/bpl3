extern printf(fmt: string, ...);

enum Option<T> {
    Some(T),
    None,
}

frame main() ret int {
    local o: Option<int> = Option<int>.Some(42);

    match (o) {
        Option<int>.Some(v) => printf("Some %d\n", v),
        Option<int>.None => printf("None\n"),
    };
    return 0;
}
