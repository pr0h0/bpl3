# CLI args

export [Args];

import [String] from "std/string.bpl";

struct Args {
    argc: int,
    argv: *string,

    frame new(argc: int, argv: *string) ret Args {
        local a: Args;
        a.argc = argc;
        a.argv = argv;
        return a;
    }

    frame count(this: *Args) ret int {
        return this.argc;
    }

    frame get(this: *Args, index: int) ret String {
        if (index < 0) {
            # Return empty
            local empty: String;
            empty.data = nullptr;
            empty.length = 0;
            return empty;
        }
        if (index >= this.argc) {
            local empty: String;
            empty.data = nullptr;
            empty.length = 0;
            return empty;
        }
        local raw: string = this.argv[index];
        return String.new(raw);
    }
}
