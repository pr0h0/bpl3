import printf, malloc, free;

struct Node {
    value: u64,
    next: *Node
}

frame create_node(val: u64) ret *Node {
    local node: *Node = call malloc(16); # Size of Node (8 bytes value + 8 bytes pointer)
    if node == NULL {
        call print("Memory allocation failed\n");
        call exit(1);
    }
    node.value = val;
    node.next = NULL;
    return node;
}

frame append(head: *Node, val: u64) {
    local current: *Node = head;
    loop {
        if current.next == NULL {
            break;
        }
        current = current.next;
    }
    current.next = call create_node(val);
}

frame insert(node: *Node, val: u64)ret *Node {
    local new_node: *Node = call create_node(val);
    new_node.next = node.next;
    node.next = new_node;
    return new_node;
}

frame print_list(head: *Node) {
    local current: *Node = head;
    loop {
        if current == NULL {
            break;
        }
        call printf("%d -> ", current.value);
        current = current.next;
    }
    call printf("NULL\n");
}

frame free_list(head: *Node) {
    local current: *Node = head;
    local next: *Node;
    loop {
        if current == NULL {
            break;
        }
        next = current.next;
        call free(current);
        current = next;
    }
}

frame main() ret u8 {
    local head: *Node = call create_node(1);
    local head2: *Node = call create_node(10);
    
    call append(head, 4);
    call append(head, 5);

    call print_list(head);

    call insert(head, 2);
    call insert(head.next, 3);

    call print_list(head);


    call append(head2, 40);
    call append(head2, 50);

    call print_list(head2);

    call insert(head2, 20);
    call insert(head2.next, 30);

    call print_list(head2);

    call free_list(head);
    call free_list(head2);
    
    return 0;
}
