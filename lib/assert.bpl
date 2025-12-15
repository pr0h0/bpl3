# Assert utilities

export [Assert];

import [IO] from "std/io.bpl";

struct Assert {
    frame that(condition: bool, message: string) {
        if (condition) {
            return;
        }
        IO.log(message);
        # Throw standard error code for assertion failure
        throw 1;
    }
}
