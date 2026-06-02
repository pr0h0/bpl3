# Bug Hunt: Break Outside Loop
import [printf] from "std/c.bpl";

frame main() {
    break; # Should error
    printf("Test\n");
}
