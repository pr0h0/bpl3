# Test importing from an installed package
import add from "math-utils";
extern printf(fmt: string, ...) ret int;
frame main() ret int {
    local result: int = add(5, 3);
    printf("5 + 3 = %d\n", result);
    return 0;
}
