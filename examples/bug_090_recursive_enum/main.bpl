import [printf] from "std/c.bpl";

# Recursive enum - should cause semantic error, not stack overflow
enum List {
    Cons(int, List), # Recursive without pointer - infinite size!
    Nil,
}

frame main() {
    printf("This should not compile\n");
}
