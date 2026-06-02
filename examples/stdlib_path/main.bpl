import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    IO.log("=== Path Demo ===");

    # 1. Join
    local joined: String = Path.join("/home/user", "file.txt");
    printf("Joined: %s\n", joined.toString());
    joined.destroy();

    # 2. Basename
    local base: String = Path.basename("/home/user/file.txt");
    printf("Basename: %s\n", base.toString());
    base.destroy();

    # 3. Dirname
    local dir: String = Path.dirname("/home/user/file.txt");
    printf("Dirname: %s\n", dir.toString());
    dir.destroy();

    # 4. Normalize
    local messy: string = "/home/user//../user/./docs";
    local norm: String = Path.normalize(messy);
    printf("Normalize: %s\n", norm.toString());
    norm.destroy();

    # 5. IsAbsolute
    if (Path.isAbsolute("/home")) {
        IO.log("IsAbsolute(/home): true");
    } else {
        IO.log("IsAbsolute(/home): false");
    }
    if (Path.isAbsolute("rel/path")) {
        IO.log("IsAbsolute(rel/path): true");
    } else {
        IO.log("IsAbsolute(rel/path): false");
    }

    # 6. Resolve
    local res: String = Path.resolve("/base/path", "../target");
    printf("Resolve: %s\n", res.toString());
    res.destroy();

    return 0;
}
