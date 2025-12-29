extern printf(fmt: string, ...);

struct Box {
    val: int,
    frame set(this: *Box, v: int) {
        this.val = v;
    }
}

frame main() ret int {
    local b: Box;
    b.val = 0;
    b.set(10); # Should pass address of b
    printf("%d\n", b.val);
    return 0;
}
