import [UTF8] from "std/utf8.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    IO.log("=== UTF8 Demo ===");
    local s: string = "hello";
    local buf: string = UTF8.encode(s);
    local dec: String = UTF8.decode(buf);
    printf("%s\n", dec.toString());
    return 0;
}
