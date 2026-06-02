# Test enum recursive - minimal test

import [printf] from "std/c.bpl";
extern malloc(size: ulong) ret *void;

enum List {
    Nil,
    Cons(int, *List),
}

frame main() ret int {
    local node1: *List = malloc(16);
    printf("Allocated node1 at %p\n", node1);
    *node1 = List.Nil;
    printf("Stored Nil in node1\n");

    local node2: *List = malloc(16);
    printf("Allocated node2 at %p\n", node2);
    *node2 = List.Cons(99, node1);
    printf("Stored Cons(99, node1) in node2\n");

    printf("Testing match on *node2\n");
    local result: int = match (*node2) {
        List.Nil => 0,
        List.Cons(value, next) => value,
    };
    printf("Match result: %d\n", result);

    return result;
}
