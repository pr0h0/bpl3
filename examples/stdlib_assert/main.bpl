import [Assert] from "std/assert.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Assert Demo ===");
    Assert.that(true, "should not fail");
    IO.log("assert ok");
    try {
        Assert.that(false, "assert failed");
        IO.log("unreachable");
    } catch (e_int: int) {
        IO.log("caught assert failure");
    }
    return 0;
}
