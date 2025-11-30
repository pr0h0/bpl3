import printf from "libc";

frame test_switch(val: u64) {
    switch val {
        case 1: {
            call printf("One\n");
        }
        case 2: {
            call printf("Two\n");
        }
        case 3: {
            call printf("Three\n");
        }
        case 10: {
            call printf("Ten\n");
        }
        default: {
            call printf("Other: %d\n", val);
        }
    }
}

frame main() ret u64 {
    call test_switch(1);
    call test_switch(2);
    call test_switch(3);
    call test_switch(10);
    call test_switch(100);
    return 0;
}
