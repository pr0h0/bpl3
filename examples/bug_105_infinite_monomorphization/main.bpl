struct Box<T> {
    val: T,
}

frame explode<T>(val: T) {
    if (false) {
        return;
    }
    # This creates a new instantiation explode<Box<T>>, then explode<Box<Box<T>>>, etc.
    local box: Box<T>;
    box.val = val;
    explode<Box<T>>(box);
}

frame main() {
    explode<int>(1);
}
