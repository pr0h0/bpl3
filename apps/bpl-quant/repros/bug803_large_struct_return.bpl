# BUG-803: returning a large struct by value is lowered as a first-class
# aggregate (`%v = load %struct.Big, ...; ret %struct.Big %v`). LLVM's
# SelectionDAG expands such aggregates field by field and array element by
# array element, so instruction selection time explodes with the struct size.
# In apps/bpl-quant, Compiler.create() (a ~14 KB struct holding fixed arrays)
# took 51 s of a 77 s -O2 build.
import printf from "std/c.bpl";

struct Slot {
    name: string,
    depth: int,
    index: int,
}

struct Big {
    slots: Slot[512],
    count: int,

    frame create() ret Big {
        local b: Big;
        b.count = 0;
        return b;
    }
}

frame main() ret int {
    local b: Big = Big.create();
    b.slots[3].depth = 7;
    printf("%d %d\n", b.count, b.slots[3].depth);
    return 0;
}
