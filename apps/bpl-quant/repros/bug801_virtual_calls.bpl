# BUG-801: a method call through a pointer is always an indirect call through
# the vtable, even when the struct has no parent and no children. At -O2 the
# call is not inlined, so accessor-style methods are several times slower
# than the equivalent free function or field access.
import printf from "std/c.bpl";
import [Clock] from "../src/core/clock.bpl";

struct Grid {
    n: int,
    data: *float,

    frame at(this: *Grid, i: int) ret float {
        return this.data[i];
    }
}

frame gridAt(g: *Grid, i: int) ret float {
    return g.data[i];
}

frame viaMethod(g: *Grid, rounds: int) ret float {
    local s: float = 0.0;
    loop (local r: int = 0; r < rounds; r = r + 1) {
        loop (local i: int = 0; i < g.n; i = i + 1) {
            s = s + g.at(i);
        }
    }
    return s;
}

frame viaFunction(g: *Grid, rounds: int) ret float {
    local s: float = 0.0;
    loop (local r: int = 0; r < rounds; r = r + 1) {
        loop (local i: int = 0; i < g.n; i = i + 1) {
            s = s + gridAt(g, i);
        }
    }
    return s;
}

frame viaField(g: *Grid, rounds: int) ret float {
    local s: float = 0.0;
    loop (local r: int = 0; r < rounds; r = r + 1) {
        loop (local i: int = 0; i < g.n; i = i + 1) {
            s = s + g.data[i];
        }
    }
    return s;
}

frame main() ret int {
    local buf: float[1024];
    loop (local i: int = 0; i < 1024; i = i + 1) {
        buf[i] = cast<float>(i % 7);
    }
    local g: Grid = Grid { n: 1024, data: &buf[0] };
    local t0: long = Clock.nowNs();
    local a: float = viaMethod(&g, 100000);
    local t1: long = Clock.nowNs();
    local b: float = viaFunction(&g, 100000);
    local t2: long = Clock.nowNs();
    local c: float = viaField(&g, 100000);
    local t3: long = Clock.nowNs();
    printf("method   %.0f ms (sum %.0f)\n", cast<float>(t1 - t0) / 1000000.0, a);
    printf("function %.0f ms (sum %.0f)\n", cast<float>(t2 - t1) / 1000000.0, b);
    printf("field    %.0f ms (sum %.0f)\n", cast<float>(t3 - t2) / 1000000.0, c);
    return 0;
}
