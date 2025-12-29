import [IO] from "std/io.bpl";
import [Any] from "std/type.bpl";

# --- Homogeneous Variadics ---

# Accepts a variable number of integers
# The compiler passes 'nums' as *Any (pointer to array of Any) and 'nums_count' as int
frame sum(nums: ...Any, count: int) ret int {
    local total: int = 0;
    local i: int = 0;
    IO.bpl_printf("sum called with count=%d\n", count);
    loop (i < count) {
        local val_any: *Any = &nums[i];
        # We assume they are ints for this demo, or check type
        if (val_any is int) {
            local val: int = cast<int>(val_any.data);
            IO.bpl_printf("nums[%d] = %d\n", i, val);
            total += val;
        }
        i += 1;
    }
    return total;
}

# --- Heterogeneous Variadics ---

# Accepts a variable number of arguments of any type
# The compiler passes 'args' as *Any (pointer to array of Any structs)
frame printMixed(args: ...Any, args_count: int) {
    local i: int = 0;
    local count: int = args_count;
    loop (i < count) {
        local arg: Any = args[i];
        if (arg is int) {
            IO.bpl_printf("Arg %d is int: %d\n", i, cast<int>(arg.data));
        } else if (arg is string) {
            # Cast u64 data to *char (string)
            IO.bpl_printf("Arg %d is string: %s\n", i, cast<*char>(arg.data));
        } else if (arg is double) {
            # Note: float/double might need special handling depending on how they are cast/stored in u64 data
            # For now, let's assume standard casting works if it fits
            IO.bpl_printf("Arg %d is double (cast to int for display): %d\n", i, cast<int>(arg.data));
        } else {
            IO.bpl_printf("Arg %d is unknown type\n", i);
        }

        i += 1;
    }
}

frame main() ret int {
    IO.printString("--- Homogeneous Variadics ---");
    local s1: int = sum(1, 2, 3);
    IO.bpl_printf("Sum(1, 2, 3) = %d\n", s1);

    local s2: int = sum(10, 20, 30, 40, 50);
    IO.bpl_printf("Sum(10...50) = %d\n", s2);

    IO.printString("\n--- Heterogeneous Variadics ---");
    printMixed(42, "Hello World", 100);

    return 0;
}
