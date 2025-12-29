extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;

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
