extern printf(fmt: string, ...);

frame run<T>() {
    printf("Size: %d\n", sizeof(T));
    local f: Lambda<void>() = || ret void {
        # Capture generic val? Might be tricky if T is not known size?
        # But here T is monomorphized.
        # printf requires concrete types, so we can't print T easily without traits.
        # Let's just capture a local int to test lambda in generic func.
        local x: int = 1;
        printf("Lambda inside generic\n");
    };
    f();
}

frame main() ret int {
    run<int>();
    return 0;
}
