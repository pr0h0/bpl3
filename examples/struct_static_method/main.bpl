extern printf(fmt: string, ...);

struct MathUtil {
    frame add(a: int, b: int) ret int {
        return a + b;
    }
}

frame main() ret int {
    printf("%d\n", MathUtil.add(10, 20));
    return 0;
}
