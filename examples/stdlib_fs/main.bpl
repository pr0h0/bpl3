import [FS] from "std/fs.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    IO.log("=== FS Demo ===");
    local path: string = "examples/stdlib_fs/tmp.txt";

    # Write
    local ok: bool = FS.writeFile(path, "Hello BPL Filesystem!");
    if (ok) {
        IO.log("Write: Success");
    } else {
        IO.log("Write: Failed");
    }

    # Exists
    if (FS.exists(path)) {
        IO.log("Exists: Yes");
    } else {
        IO.log("Exists: No");
    }

    # Read
    local content: String = FS.readFile(path);
    printf("Content: %s\n", content.toString());
    content.destroy();

    return 0;
}
