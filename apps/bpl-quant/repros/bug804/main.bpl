# BUG-804: `bpl build` and `bpl run` report an error inside an imported
# module at the importing `import` statement of the entry file
# ("main.bpl:8:1: Failed to resolve import './middle.bpl': Failed to resolve
# import './helper.bpl': 'ret' is a reserved word ...") with no file, line or
# column for the offending token, even for a direct import (direct.bpl).
# `bpl check` on the same file reports helper.bpl:6:11 correctly.
import quad from "./middle.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    printf("%d\n", quad(21));
    return 0;
}
