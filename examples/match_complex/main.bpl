enum Tree {
    Leaf(int),
    Node(*Tree, *Tree),
}

import [printf] from "std/c.bpl";
extern malloc(size: ulong) ret *void;

frame createLeaf(val: int) ret *Tree {
    local t: *Tree = cast<*Tree>(malloc(sizeof<Tree>()));
    *t = Tree.Leaf(val);
    return t;
}

frame createNode(left: *Tree, right: *Tree) ret *Tree {
    local t: *Tree = cast<*Tree>(malloc(sizeof<Tree>()));
    *t = Tree.Node(left, right);
    return t;
}

frame sumTree(t: *Tree) ret int {
    if (t == nullptr) {
        return 0;
    }
    return match (*t) {
        Tree.Leaf(val) => val,
        Tree.Node(left, right) => {
            local l_sum: int = sumTree(left);
            local r_sum: int = sumTree(right);
            return l_sum + r_sum;
        },
    };
}

enum Command {
    Print(string),
    Add(int, int),
    Exit,
}

frame processCommand(cmd: Command) ret int {
    return match (cmd) {
        Command.Print(msg) => {
            printf("Printing: %s\n", msg);
            return 0;
        },
        Command.Add(a, b) => {
            printf("Adding %d + %d\n", a, b);
            return a + b;
        },
        Command.Exit => {
            printf("Exiting...\n");
            return -1;
        },
    };
}

frame main() {
    # Test recursive tree sum
    local t: *Tree = createNode(createNode(createLeaf(1), createLeaf(2)), createLeaf(3));

    local sum: int = sumTree(t);
    printf("Tree sum: %d\n", sum);

    # Test command processing with side effects
    local c1: Command = Command.Print("Hello");
    local c2: Command = Command.Add(10, 20);
    local c3: Command = Command.Exit;

    processCommand(c1);
    local res: int = processCommand(c2);
    printf("Add result: %d\n", res);

    local exit_code: int = processCommand(c3);
    printf("Exit code: %d\n", exit_code);

    # Test nested match with different types
    local nested_res: int = match (c2) {
        Command.Add(a, b) => {
            # Inner logic
            local is_big: bool = false;
            if (a > 15) {
                is_big = true;
            }
            if (is_big) {
                return 100;
            }
            return 0;
        },
        _ => -1,
    };

    printf("Nested result: %d\n", nested_res);
}
