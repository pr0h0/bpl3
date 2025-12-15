import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== JSON Demo ===");
    local s: String = JSON.stringifyInt(-123);
    printf("%s\n", s.cstr());
    IO.printInt(JSON.parse("456"));
    return 0;
}
