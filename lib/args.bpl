# CLI args

export [Args];

import [String] from "std/string.bpl";
extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret *char;
extern strlen(s: *char) ret int;
extern malloc(size: i64) ret *char;
extern free(ptr: *char) ret void;

struct Args {
    frame count() ret int {
        return __bpl_argc();
    }

    frame get(index: int) ret String {
        local arg: *char = __bpl_argv_get(index);
        if (arg == null) {
            local empty: String;
            empty.data = null;
            empty.length = 0;
            return empty;
        }
        return String.new(arg);
    }
}
