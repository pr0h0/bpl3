extern printf(fmt: string, ...);

frame foo(v: *void) {
    # Use v to avoid unused variable error
    local p: *void = v;
    # Use p
    if (p == nullptr) {
        printf("p is nullptr\n");
        return;
    }
    printf("p is not nullptr\n");
}

frame main() ret int {
    local v: *void = nullptr;
    foo(v);
    return 0;
}
