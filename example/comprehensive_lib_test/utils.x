import printf, exit from "libc";

frame assert(condition: u8, message: *u8) {
    if condition == 0 {
        call printf("FAIL: %s\n", message);
        call exit(1);
    }
    call printf("PASS: %s\n", message);
}

export assert;
