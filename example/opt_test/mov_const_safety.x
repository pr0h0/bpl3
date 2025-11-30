import printf from "libc";
extern printf(fmt: string, ...);

frame main() ret i64 {
    local a: i64 = 10;
    asm {
        mov rbx, rax
    }

    local b: i64 = 20;

    call printf("a=%d, b=%d\n", a, b);
    return 0;
}
