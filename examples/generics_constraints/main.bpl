import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
}

frame make_box<T>(val: T) ret Box<T> {
    local b: Box<T>;
    b.val = val;
    return b;
}

struct Container<T> {
    item: T,
}

# Constraint: T must be compatible with Box<int>
frame process_box<T: Box<int>>(b: T) {
    printf("Processing box with value: %d\n", b.val);
}

# Constraint: T must be compatible with int
frame process_int<T: int>(val: T) {
    printf("Processing int: %d\n", val);
}

# Multiple constraints
frame process_two<T: int, U: Box<int>>(a: T, b: U) {
    printf("Processing two: %d, %d\n", a, b.val);
}

# Inference with constraints
frame infer_constraint<T: Box<int>>(b: T) {
    printf("Inferred constraint: %d\n", b.val);
}

struct Parent {
    id: int,
}

struct Child: Parent {
    name: string,
}

# Inheritance constraint
frame process_parent<T: Parent>(p: T) {
    printf("Processing parent id: %d\n", p.id);
}

frame main() {
    local b: Box<int> = make_box<int>(42); # Inference should work here too!

    # Explicit type argument
    process_box<Box<int>>(b);

    # Inference
    infer_constraint<Box<int>>(b);

    # Primitive constraint
    process_int<int>(10);
    process_int<int>(20); # Inference

    # Multiple constraints
    process_two<int, Box<int>>(100, b);

    # Inheritance
    local p: Parent = Parent { id: 1 };
    local c: Child = Child { id: 2, name: "child" };

    process_parent<Parent>(p);
    process_parent<Child>(c); # Should work because Child is subtype of Parent
}
