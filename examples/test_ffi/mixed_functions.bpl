extern printf(fmt: *i8, ...) ret i32;
extern strlen(s: *i8) ret u64;

frame custom_strlen(s: *i8) ret u64 {
    return strlen(s);
}

frame main() ret i32 {
    printf("Mixed functions OK\n");
    return 0;
}
