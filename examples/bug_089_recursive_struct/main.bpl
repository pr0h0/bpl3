import [printf] from "std/c.bpl";

# This should cause a semantic error, not an LLVM error
struct Node {
    value: int,
    next: Node,
    # Recursive without pointer - infinite size!
}

frame main() {
    printf("This should not compile\n");
}
