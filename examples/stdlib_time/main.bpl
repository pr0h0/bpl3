import [Time] from "std/time.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Time Demo ===");
    local _t1: int = Time.now();
    Time.sleep(10);
    IO.printIntLn(1);
    return 0;
}
