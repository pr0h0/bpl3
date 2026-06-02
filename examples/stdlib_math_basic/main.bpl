import [printf] from "std/c.bpl";
import [Math] from "std";

frame main() ret int {
    local m: int = Math.max(10, 20);
    local n: int = Math.min(10, 20);
    printf("Max: %d, Min: %d\n", m, n);
    return 0;
}
