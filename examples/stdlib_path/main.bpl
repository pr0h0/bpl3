import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== Path Demo ===");
    local joined: String = Path.join("/home/user", "file.txt");
    printf("%s\n", joined.cstr());
    local base: String = Path.basename("/home/user/file.txt");
    printf("%s\n", base.cstr());
    local dir: String = Path.dirname("/home/user/file.txt");
    printf("%s\n", dir.cstr());
    return 0;
}
