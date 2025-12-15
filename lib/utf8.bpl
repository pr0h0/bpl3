# UTF-8 (simple wrappers)

export [UTF8];

import [String] from "std/string.bpl";

struct UTF8 {
    frame encode(s: string) ret *char {
        # Strings are already UTF-8; return pointer
        return cast<*char>(s);
    }
    frame decode(buf: *char) ret String {
        # Construct String from char* buffer
        return String.new(buf);
    }
}
