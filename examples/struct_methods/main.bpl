import [printf] from "std/c.bpl";

struct Counter {
    val: int,
    frame inc(this: *Counter) {
        this.val = this.val + 1;
    }

    frame get(this: *Counter) ret int {
        return this.val;
    }
}

frame main() ret int {
    local c: Counter;
    c.val = 0;
    c.inc();
    c.inc();
    printf("Count: %d\n", c.get());
    return 0;
}
