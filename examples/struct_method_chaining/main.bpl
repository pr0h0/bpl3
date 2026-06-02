import [printf] from "std/c.bpl";

struct Counter {
    val: int,
    frame inc(this: Counter) ret Counter {
        this.val = this.val + 1;
        return this;
    }
}

frame main() ret int {
    local c: Counter;
    c.val = 0;
    # Note: This copies 'c' each time because it returns by value
    c = c.inc().inc().inc();
    printf("%d\n", c.val);
    return 0;
}
