import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

# Note: count must be declared last for BPL variadics
frame sum(args: ...int, count: int) ret int {
    local total: int = 0;
    local i: int = 0;

    loop (i < count) {
        total = total + args[i];
        i = i + 1;
    }

    return total;
}

frame concat(s: ...string, c: int) {
    local i: int = 0;
    local cum: String = String.new("");
    loop (i < c) {
        IO.bpl_printf("%s\n", s[i]);
        cum << s[i];
        ++i;
    }

    IO.bpl_printf("%s\n", cum.toString());
}

frame main() ret int {
    local s: int = sum(10, 20, 30);
    IO.bpl_printf("Sum: %d\n", s);
    concat("Hello ", "Variadic ", "Functions!");
    return 0;
}
