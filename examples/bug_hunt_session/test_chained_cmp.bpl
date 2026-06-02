# Bug Hunt: Chained comparisons
import [printf] from "std/c.bpl";

frame main() {
    # Chained comparison like Python: 1 < 2 < 3
    # This should not work like Python (1 < 2 AND 2 < 3)
    # It should evaluate left to right: (1 < 2) < 3 = true < 3 = 1 < 3 = true
    local result: bool = (1 < 2) < 3;
    if (result) {
        printf("Result is true\n");
    } else {
        printf("Result is false\n");
    }

    # What about 3 > 2 > 1? 
    # (3 > 2) > 1 = true > 1 = 1 > 1 = false
    local result2: bool = (3 > 2) > 1;
    if (result2) {
        printf("Result2 is true\n");
    } else {
        printf("Result2 is false\n");
    }
}
