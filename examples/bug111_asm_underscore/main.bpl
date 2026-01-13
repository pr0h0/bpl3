extern printf(fmt: string, ...);
frame main() {
    local my_var: int = 10;
    local out_val: int = 0;

    asm("intel") {
        mov eax, (my_var)
        add eax, 5
        mov (=out_val), eax
    }

    if (out_val == 15) {
        printf("Success: out_val = %d\n", out_val);
        return;
    }
    # Fail
    printf("Failure: out_val = %d\n", out_val);
    exit(1);
}

extern exit(code: int);
