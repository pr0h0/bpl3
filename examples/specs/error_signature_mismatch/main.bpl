spec S {
    frame foo(this: *Self, x: int);
}

struct Mismatch: S {
    frame foo(this: *Mismatch, x: string) {
        # Wrong param type
        # ...
    }
}

frame main() {
    local m: Mismatch = Mismatch {};
}
