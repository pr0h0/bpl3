import [printf] from "std/c.bpl";

frame main() ret int {
    local a: int = 10;
    local res: int = 0;

    printf("Before: a=%d, res=%d\n", a, res);

    # Inline LLVM IR with interpolation
    asm {
        %val = load i32, i32* (a)
        %temp = add i32 %val, 1
        store i32 %temp, i32* (res)
    }

    printf("After: a=%d, res=%d\n", a, res);
    return 0;
}
