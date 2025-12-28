struct Box<T> {
    val: T,
}

struct Node<T> {
    next: *Node<Box<T>>,
}

frame main() ret int {
    local n: Node<int>;
    n.next = nullptr;
    local next: *Node<Box<int>> = n.next;
    if (next == nullptr) {
        return 0;
    }
    return 1;
}
