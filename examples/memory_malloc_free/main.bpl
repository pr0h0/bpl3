import [printf] from "std/c.bpl";
import [malloc] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main() ret int {
    local ptr: *int = cast<*int>(malloc(sizeof<int>()));
    *ptr = 999;
    printf("%d\n", *ptr);
    free(cast<*void>(ptr));
    return 0;
}
