import printf from "libc";

frame test() {
    local x: u64 = 1;
    if x < 5 {
        call printf("yes\n");
    }
}

frame main() ret i32 {
    call test();
    return 0;
}
