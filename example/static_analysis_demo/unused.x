frame unused_arg(x: u64, _y: u64) {
    # x is unused
}
frame main() {
    local a: u64 = 10;
    local _b: u64 = 20;
    local c: u64 = 30;
    local d: u64 = c + 1;
    # d is unused.
}
