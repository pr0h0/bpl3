import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== JSON Demo ===");
    local val: int = -123;
    local s: String = JSON.stringify<int>(&val);
    printf("%s\n", s.toString());
    local parsed: *int = JSON.parse<int>("456");
    IO.printIntLn(*parsed);
    return 0;
}
