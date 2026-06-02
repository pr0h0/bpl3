import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
    id: int,
}

frame make_box<T>(val: T, id: int) ret Box<T> {
    local b: Box<T>;
    b.val = val;
    b.id = id;
    return b;
}

# Constraint: B must be ANY Box<T>
# The constraint 'Box' (without <...>) acts as a wildcard for any instantiation of Box.
frame print_box_id<B: Box>(b: B) {
    # We can access non-generic members safely.
    # 'id' is of type int, so it doesn't depend on T.
    printf("Box ID: %d\n", b.id);
}

frame main() {
    local b1: Box<int> = make_box<int>(10, 1);
    local b2: Box<string> = make_box<string>("hello", 2);

    # Pass Box<int> to function expecting Box (wildcard)
    print_box_id<Box<int>>(b1);

    # Pass Box<string> to function expecting Box (wildcard)
    print_box_id<Box<string>>(b2);
}
