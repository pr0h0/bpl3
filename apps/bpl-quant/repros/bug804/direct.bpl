import twice from "./helper.bpl";
import printf from "std/c.bpl";
frame main() ret int {
    printf("%d\n", twice(1));
    return 0;
}
