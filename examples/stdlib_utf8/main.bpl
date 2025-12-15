import [UTF8] from "std/utf8.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== UTF8 Demo ===");
    local s: string = "hello";
    local buf: *char = UTF8.encode(s);
    local dec: String = UTF8.decode(buf);
    printf("%s\n", dec.cstr());
    return 0;
}
