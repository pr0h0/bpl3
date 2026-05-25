import [IO] from "std/io.bpl";

struct Container<T> {
    value: T,
    frame getValue(this: Container<T>) ret T {
        return this.value;
    }
}

struct IntContainer: Container<int> {
    # Inherits getValue
}

frame main() {
    local c: IntContainer = IntContainer { value: 42 };
    local v: int = c.getValue();
    IO.print("Value: ");
    IO.printIntLn(v);
}
