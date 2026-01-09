import [NullAccessError] from "std/errors.bpl";

extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: *Point = nullptr;

    try {
        # This should trigger a NullAccessError
        p.x;
        printf("Should not reach here\n");
    } catch (e: NullAccessError) {
        printf("Caught NullAccessError:\n");
        printf("Message: %s\n", e.message);
        printf("Function: %s\n", e.function);
        printf("Expression: %s\n", e.expression);
        printf("Location: %d:%d\n", e.line, e.column);
    }
    return 0;
}
