# Leveled logging

export [Log];

import [IO] from "std/io.bpl";

struct Log {
    frame debug(msg: string) {
        IO.log(msg);
    }
    frame info(msg: string) {
        IO.log(msg);
    }
    frame warn(msg: string) {
        IO.log(msg);
    }
    frame error(msg: string) {
        IO.log(msg);
    }
}
