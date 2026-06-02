import [printf] from "std/c.bpl";

struct P {
    x: int,
    y: int,
}

frame main() ret int {
    # Create a struct with literal
    local val: P = P { x: 5, y: 10 };
    local p: *P = &val;

    printf("Created struct p\n");

    if (p == nullptr) {
        printf("p == nullptr: true\n");
    } else {
        printf("p == nullptr: false\n");
    }

    return 0;
}
