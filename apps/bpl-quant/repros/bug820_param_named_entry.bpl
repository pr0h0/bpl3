# BUG-820: a parameter named `entry` produces invalid LLVM IR.
#
# The parameter becomes the SSA value %entry and the function's first block
# is also labelled `entry`, so clang fails with
# "unable to create block named 'entry'". A local named `entry` is fine.
# Expected: prints 7. Actual: the build fails in clang.

import printf from "std/c.bpl";

frame distance(entry: float, stop: float) ret float {
    return entry - stop;
}

frame main() ret int {
    printf("%.0f\n", distance(10.0, 3.0));
    return 0;
}
