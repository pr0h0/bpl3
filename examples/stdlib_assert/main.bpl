import printf from "std/c.bpl";
import [Assert] from "std/assert.bpl";

frame failsWith(label: string, check: Lambda<void>()) {
    local failed: bool = false;
    try {
        check();
    } catch (code: int) {
        failed = code == 1;
    }
    printf("%s failed %d\n", label, cast<int>(failed));
}

frame main() ret int {
    # Passing assertions print nothing.
    Assert.isTrue(1 < 2, "ordering");
    Assert.isFalse(2 < 1, "ordering");
    Assert.equalInt(4, 4, "ints");
    Assert.equalLong(9000000000, 9000000000, "longs");
    Assert.equalString("bpl", "bpl", "strings");
    Assert.equalString(cast<string>(nullptr), cast<string>(nullptr), "nulls");
    Assert.near(0.1 + 0.2, 0.3, 0.000001, "sum");

    failsWith("equalInt", || ret void {
        Assert.equalInt(2 + 2, 5, "sum");
    });
    failsWith("equalString", || ret void {
        Assert.equalString("bpl", "BPL", "name");
    });
    failsWith("equalString null", || ret void {
        Assert.equalString(cast<string>(nullptr), "x", "value");
    });
    failsWith("near", || ret void {
        Assert.near(1.0, 1.5, 0.1, "ratio");
    });
    failsWith("fail", || ret void {
        Assert.fail("unreachable");
    });
    return 0;
}
