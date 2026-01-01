extern printf(fmt: string, ...);
enum Value {
    Int(int),
}
frame main() {
    local v: Value = Value.Int(1);
    match (v) {
        Value.Int(i) => 1 + 1,
    };
}
