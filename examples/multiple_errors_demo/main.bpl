# Demo file with multiple errors for collect-all mode

# Two semantic errors that should be reported in one pass:
# 1) Type mismatch: assign string to int
# 2) Return value from a function declared to return void

import [printf] from "std/c.bpl";
frame main() {
    # Error 1: type mismatch
    local x: int = "string";

    # Some valid call (for context)
    printf("value: %d\n", 42);

    # Error 2: returning value from void function
    return 0;
}
