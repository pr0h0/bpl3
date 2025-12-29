extern printf(fmt: string, ...);

enum Result<T, E> {
    Ok(T),
    Err(E),
}

frame main() ret int {
    local r: Result<int, string> = Result<int, string>.Ok(10);

    match (r) {
        Result<int, string>.Ok(v) => printf("Ok %d\n", v),
        Result<int, string>.Err(e) => printf("Err %s\n", e),
    };
    return 0;
}
