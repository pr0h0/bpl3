import [StringUtils] from "std/string_utils.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== String Utils Demo ===");
    local s: string = "  hello world  ";
    local sw: bool = StringUtils.startsWith(s, "  he");
    local sw_i: int = 0;
    if (sw) {
        sw_i = 1;
    }
    IO.printInt(sw_i);
    local ew: bool = StringUtils.endsWith(s, "d  ");
    local ew_i: int = 0;
    if (ew) {
        ew_i = 1;
    }
    IO.printInt(ew_i);
    local trimmed: String = StringUtils.trim(s);
    printf("%s\n", trimmed.toString());
    IO.printInt(StringUtils.find("abc", cast<char>(98)));
    local replaced: String = StringUtils.replaceChar("a-b-c", cast<char>(45), cast<char>(43));
    printf("%s\n", replaced.toString());

    IO.log("=== String.assign & includes ===");
    # Managed String tests for assign() and includes()
    local m: String = String.new("hello world");
    # includes should find substring "world"
    local inc1: bool = m.includes("world");
    if (inc1) {
        IO.printInt(1);
    } else {
        IO.printInt(0);
    }

    # assign a new C-string into the managed String
    m.assign("goodbye");
    IO.printString(m.toString());
    # now includes should not find "world"
    local inc2: bool = m.includes("world");
    if (inc2) {
        IO.printInt(1);
    } else {
        IO.printInt(0);
    }

    # includes should find substring "good"
    IO.printInt(m.includes("good") ? 1 : 0);
    return 0;
}
