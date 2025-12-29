extern printf(fmt: string, ...);

struct Node {
    val: int,
    next: *Node,
    frame setNext(this: *Node, n: *Node) {
        this.next = n;
    }
}

frame main() ret int {
    local n1: Node;
    local n2: Node;
    n1.val = 1;
    n2.val = 2;
    n1.setNext(&n2);
    printf("%d\n", n1.next.val);
    return 0;
}
