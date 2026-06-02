import [IO] from "std/io.bpl";
import [printf] from "std/c.bpl";

struct Container<T> {
    value: T,
    frame getValue(this: Container<T>) ret T {
        return this.value;
    }
}

struct IntContainer: Container<int> {
}

frame main() {
    local c: IntContainer = IntContainer { value: 10 };
    printf("Value: %d\n", c.getValue());
}
