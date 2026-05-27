# Test recursive enums with pointers

extern printf(fmt: string, ...) ret int;
extern malloc(size: ulong) ret *void;

enum List {
    Nil,
    Cons(int, *List),
}

frame listSum(list: *List) ret int {
    if (list == nullptr) {
        return 0;
    }
    return match (*list) {
        List.Nil => 0,
        List.Cons(value, next) => value + listSum(next),
    };
}

frame main() ret int {
    # Create list: 1 -> 2 -> 3 -> Nil
    local node3: *List = malloc(cast<ulong>(sizeof<List>()));
    *node3 = List.Nil;

    local node2: *List = malloc(cast<ulong>(sizeof<List>()));
    *node2 = List.Cons(3, node3);

    local node1: *List = malloc(cast<ulong>(sizeof<List>()));
    *node1 = List.Cons(2, node2);

    local head: *List = malloc(cast<ulong>(sizeof<List>()));
    *head = List.Cons(1, node1);

    local sum: int = listSum(head);
    printf("List sum: %d\n", sum);

    return 0;
}
