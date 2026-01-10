import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

struct Node {
    value: int,
    next: *Node,
}

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== JSON Pointer Test ===");

    # 1. Serialization of Pointer
    local n2: Node;
    n2.value = 20;
    n2.next = nullptr;

    local n1: Node;
    n1.value = 10;
    n1.next = &n2;

    local json: String = JSON.stringify<Node>(&n1);
    printf("Original: %s\n", json.toString());

    # 2. Parsing of Pointer
    IO.log("Parsing...");
    local parsed: *Node = JSON.parse<Node>(json.toString());

    if (parsed == nullptr) {
        IO.log("Parse failed!");
        return 1;
    }
    printf("Node 1: %d\n", parsed.value);
    if (parsed.next != nullptr) {
        printf("Node 2: %d\n", parsed.next.value);
    } else {
        IO.log("Node 2 is null (Error!)");
    }

    # 3. Clean up
    IO.log("Freeing...");
    JSON.free<Node>(parsed);
    IO.log("Done.");

    return 0;
}
