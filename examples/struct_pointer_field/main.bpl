import [printf] from "std/c.bpl";
import [malloc] from "std/c.bpl";

struct Node {
    val: int,
    next: *Node,
}

frame main() ret int {
    local n1: Node;
    local n2: Node;
    n1.val = 1;
    n2.val = 2;
    n1.next = &n2;
    n2.next = nullptr;

    printf("%d -> %d\n", n1.val, n1.next.val);
    return 0;
}
