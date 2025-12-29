extern printf(fmt: string, ...);
import [Math] from "std";

frame main() ret int {
    local m: int = Math.maxInt(10, 20);
    local n: int = Math.minInt(10, 20);
    printf("Max: %d, Min: %d\n", m, n);
    return 0;
}
