import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [StringUtils] from "std/string_utils.bpl";
import [IO] from "std/io.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== String Utils Demo ===");

    local text: String = String.new("Hello World BPL");

    # Includes
    if (text.includes("World")) {
        IO.log("Includes 'World': Yes");
    } else {
        IO.log("Includes 'World': No");
    }

    if (text.includes("Python")) {
        IO.log("Includes 'Python': Yes");
    } else {
        IO.log("Includes 'Python': No");
    }

    # Substring
    # "Hello" is 0-5
    local sub: String = text.substring(0, 5);
    printf("Substring(0,5): %s\n", sub.toString());
    sub.destroy();

    # Split
    local parts: Array<String> = text.split(cast<char>(32)); # space
    printf("Split Parts: %d\n", parts.length);
    local i: int = 0;
    loop (i < parts.length) {
        printf("Part %d: %s\n", i, parts.get(i).toString());
        i = i + 1;
    }

    # StringUtils Module tests
    local raw: string = text.toString();
    if (StringUtils.startsWith(raw, "Hello")) {
        IO.log("StartsWith 'Hello': Yes");
    }
    if (StringUtils.endsWith(raw, "BPL")) {
        IO.log("EndsWith 'BPL': Yes");
    }
    # Cleanup
    text.destroy();

    # Manual cleanup 
    i = 0;
    loop (i < parts.length) {
        parts.getRef(i).destroy();
        i = i + 1;
    }
    parts.destroy();

    return 0;
}
