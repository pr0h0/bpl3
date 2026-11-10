export twice;

frame twice(x: int) ret int {
    local first: int = x;
    local second: int = x;
    local ret: int = first + second;
    return ret;
}
