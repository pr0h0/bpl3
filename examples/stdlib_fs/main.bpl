import [FS] from "std/fs.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== FS Demo ===");
    local path: string = "examples/stdlib_fs/tmp.txt";
    local ok: bool = FS.writeFile(path, "hello");
    local ok_i: int = 0;
    if (ok) {
        ok_i = 1;
    }
    IO.printInt(ok_i);
    local ex: bool = FS.exists(path);
    local ex_i: int = 0;
    if (ex) {
        ex_i = 1;
    }
    IO.printInt(ex_i);
    local content: String = FS.readFile(path);
    printf("%s\n", content.cstr());
    return 0;
}
