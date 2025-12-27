import [IO] from "std/io.bpl";
import [Any] from "std/type.bpl";

# Test explicit variadic syntax with "..."
frame myPrintf(fmt: string, args: ...Any, _count: int) {
    # Unsafe access for demo purposes
    # args is *Any (pointer to array of Any)
    # args[0] is Any
    # We need address of Any to access fields if it's an lvalue?
    # Or if args[0] returns value, we can access fields.

    # But wait, if args is *Any, args[0] is Any.
    # We want to access data.

    local arg0: *Any = &args[0];
    local arg1: *Any = &args[1];

    local s: *char = cast<*char>(arg0.data);
    local d: int = cast<int>(arg1.data);
    IO.bpl_printf(fmt, s, d);
}

frame sum(args: ...Any, count: int) ret int {
    local total: int = 0;
    local i: int = 0;
    loop (i < count) {
        local arg: *Any = &args[i];
        # Check type dynamically
        if ((arg is int)) {
            total = total + cast<int>(arg.data);
        }
        i = i + 1;
    }
    return total;
}

frame main() ret int {
    IO.printString("--- Variadic Syntax Test ---");
    myPrintf("Hello %s, count is %d\n", "World", 123);

    local s: int = sum(1, 2, 3, 4, 5);
    IO.bpl_printf("Sum: %d\n", s);

    return 0;
}
