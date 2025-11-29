import printf from "libc";
import exit from "./std.x";

frame print_u64(n: u64) {
    call printf("%lu", n);
}

frame println_u64(n: u64) {
    call printf("%lu\n", n);
}

frame print_i64(n: i64) {
    call printf("%ld", n);
}

frame println_i64(n: i64) {
    call printf("%ld\n", n);
}

frame print_str(s: *u8) {
    call printf("%s", s);
}

frame println_str(s: *u8) {
    call printf("%s\n", s);
}

frame print_char(c: u8) {
    call printf("%c", c);
}

frame println() {
    call printf("\n");
}

frame exit_program(code: i32) {
    call exit(code);
}

export print_u64;
export println_u64;
export print_i64;
export println_i64;
export print_str;
export println_str;
export print_char;
export println;
export exit_program;
