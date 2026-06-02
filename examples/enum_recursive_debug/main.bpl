# Test recursive enums with pointers - debug version

import [printf] from "std/c.bpl";
extern malloc(size: ulong) ret *void;

enum MyList {
    Nil,
    Cons(int, *MyList),
}

frame main() ret int {
    printf("Creating Nil node\n");
    local node3: *MyList = malloc(16);
    *node3 = MyList.Nil;
    printf("Created node3 (Nil)\n");

    printf("Creating Cons(3, node3)\n");
    local node2: *MyList = malloc(16);
    *node2 = MyList.Cons(3, node3);
    printf("Created node2 (Cons(3, node3))\n");

    printf("Testing pattern match\n");
    local result: int = match (*node2) {
        MyList.Nil => 0,
        MyList.Cons(value, next) => value,
    };

    printf("Result: %d\n", result);
    return result;
}
