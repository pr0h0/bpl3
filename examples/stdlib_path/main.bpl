import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== Path Demo ===");
    local joined: String = Path.join("/home/user", "file.txt");
    printf("%s\n", joined.toString());
    local base: String = Path.basename("/home/user/file.txt");
    printf("%s\n", base.toString());
    local dir: String = Path.dirname("/home/user/file.txt");
    printf("%s\n", dir.toString());
    return 0;
}
