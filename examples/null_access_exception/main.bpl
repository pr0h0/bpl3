import [NullAccessError] from "std/errors.bpl";
import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    printf("Testing nullptr access exception handling\n");

    try {
        local p: *Point = nullptr;
        local _value: int = p.x; # Should throw NullAccessError
        printf("Should not reach here\n");
    } catch (e: NullAccessError) {
        printf("Caught nullptr access exception!\n");
        printf("Message: %s\n", e.message);
        printf("Function: %s\n", e.function);
        printf("Expression: %s\n", e.expression);
    }
    printf("Program continues after catching exception\n");
    return 0;
}
