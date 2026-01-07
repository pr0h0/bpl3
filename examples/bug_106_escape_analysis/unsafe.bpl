frame foo() ret *int {
    local _x: int = 42;
    return &_x; # Should be allowed
}

frame main() {
    local ptr: *int = foo();
    # prevent unused error
    if (ptr == nullptr) {
        return;
    }
}
