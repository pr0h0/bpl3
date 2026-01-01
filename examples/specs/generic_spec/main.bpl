extern printf(fmt: string, ...);

spec Container<T> {
    frame get(this: *Self) ret T;
    frame set(this: *Self, val: T);
}

struct IntBox: Container<int> {
    val: int,
    frame get(this: *IntBox) ret int {
        return this.val;
    }

    frame set(this: *IntBox, val: int) {
        this.val = val;
    }
}

frame main() {
    local box: IntBox = IntBox { val: 0 };
    box.set(42);
    printf("Box contains: %d\n", box.get());
}
