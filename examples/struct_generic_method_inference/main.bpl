extern printf(fmt: string, ...);

struct Util {
    frame id<T>(this: Util, x: T) ret T {
        return x;
    }
}

frame main() ret int {
    local u: Util;
    # Inference should work
    printf("%s\n", u.id("42"));
    return 0;
}
