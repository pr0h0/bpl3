import [printf] from "std/c.bpl";

frame main() ret int {
    local x: long = 10;
    local res: long = 0;

    # Default clobbers (implicit)
    asm("intel") {
        mov rax, (x)
        add rax, 5
        mov [(&res)], rax
    }
    printf("Result 1: %ld\n", res);

    # Custom clobbers (explicit)
    asm("intel") {
        mov rax, (x)
        add rax, 10
        mov [(&res)], rax
        [ "memory", "cc", "rax" ]
    }
    printf("Result 2: %ld\n", res);

    # Custom clobbers with 'default' keyword
    asm("intel") {
        mov rax, (x)
        add rax, 20
        mov [(&res)], rax
        [ "default", "rax" ]
    }
    printf("Result 3: %ld\n", res);

    # Auto-detected clobbers
    asm("intel") {
        mov rbx, 100
        add rbx, 5
        mov [(&res)], rbx
    }
    printf("Result 4: %ld\n", res);

    return 0;
}
