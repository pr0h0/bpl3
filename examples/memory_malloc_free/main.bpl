extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    local ptr: *int = cast<*int>(malloc(sizeof<int>()));
    *ptr = 999;
    printf("%d\n", *ptr);
    free(cast<*void>(ptr));
    return 0;
}
