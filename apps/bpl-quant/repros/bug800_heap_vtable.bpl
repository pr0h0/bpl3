# BUG-800: a method call through a pointer to malloc'd storage of a struct
# that declares methods dispatches through the uninitialized hidden vtable
# word and crashes (SIGSEGV at a small address), although `Cell` has no
# parent and no children, so the call has exactly one possible target.
import printf, malloc, memset from "std/c.bpl";

struct Cell {
    value: long,

    frame doubled(this: *Cell) ret long {
        return this.value * 2;
    }
}

frame main() ret int {
    local cells: *Cell = cast<*Cell>(malloc(sizeof(Cell) * 4));
    memset(cast<*void>(cells), 0, sizeof(Cell) * 4);
    cells[1].value = 21;
    local p: *Cell = cells + 1;
    printf("field %lld\n", p.value);
    printf("method %lld\n", p.doubled());
    return 0;
}
