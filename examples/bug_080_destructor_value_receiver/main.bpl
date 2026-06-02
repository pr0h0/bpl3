import [printf] from "std/c.bpl";

# This should cause a semantic error - destructor must have pointer receiver
struct D {
    value: int,
    frame destroy(this: D) {
        printf("Destroying with value receiver\n");
    }
}

frame main() {
    printf("This should not compile\n");
}
