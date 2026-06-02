import [printf] from "std/c.bpl";

# Recursive type alias - should cause semantic error, not stack overflow
type List = (int, List);

frame main() {
    printf("This should not compile\n");
}
