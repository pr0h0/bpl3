# CLI args

export [Args];

import [String] from "std/string.bpl";
extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret string;
extern strlen(s: string) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;

struct Args {
    frame count() ret int {
        return __bpl_argc();
    }

    frame get(index: int) ret String {
        local arg: string = __bpl_argv_get(index);
        if (arg == nullptr) {
            local empty: String;
            empty.data = nullptr;
            empty.length = 0;
            return empty;
        }
        return String.new(arg);
    }
}
