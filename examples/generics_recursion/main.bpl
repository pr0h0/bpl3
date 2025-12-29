extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;

struct Node<T> {
    value: T,
    next: *Node<T>,
}

frame main() ret int {
    local n1: Node<int>;
    n1.value = 1;
    n1.next = nullptr;

    local n2: Node<int>;
    n2.value = 2;
    n2.next = &n1;

    printf("Node 2: %d, Next: %d\n", n2.value, n2.next.value);

    return 0;
}
