import [IO] from "std/io.bpl";

struct Container<T> {
    value: T,
    frame getValue(this: *Container<T>) ret T {
        return this.value;
    }
}

struct IntContainer: Container<int> {
    id: int,
}

frame main() {
    local c: IntContainer = IntContainer { value: 42, id: 1 };

    local v: int = c.getValue();
    IO.print("Value: ");
    IO.printIntLn(v);
}
