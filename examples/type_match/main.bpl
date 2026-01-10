import [IO] from "std/io.bpl";
import [Any] from "std/type.bpl";
import [TypeInfo] from "std/reflection.bpl";

frame main() ret int {
    IO.printString("--- Type Match Test ---");

    # We need to construct Any manually or use a helper since we can't pass Any directly to non-variadic yet?
    # Or we can use a variadic helper to get Any

    test_match(42, "hello", 3.14);

    return 0;
}

frame test_match(args: ...Any, args_count: int) {
    local i: int = 0;
    loop (i < args_count) {
        local val: *Any = &args[i];
        if (match<int>(val)) {
            local v: int = cast<int>(val.data);
            IO.bpl_printf("Matched int: %d\n", v);
        } else if (val is string) {
            local s: *char = cast<*char>(val.data);
            IO.bpl_printf("Matched string: %s\n", s);
        } else if (match<*char>(val)) {
            local s: *char = cast<*char>(val.data);
            IO.bpl_printf("Matched *char: %s\n", s);
        } else {
            IO.bpl_printf("Matched unknown type: %s\n", val.type_info.name);
        }
        i = i + 1;
    }
}
