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
    printf("%s\n", trimmed.cstr());
    IO.printInt(StringUtils.find("abc", cast<char>(98)));
    local replaced: String = StringUtils.replaceChar("a-b-c", cast<char>(45), cast<char>(43));
    printf("%s\n", replaced.cstr());
    return 0;
}
