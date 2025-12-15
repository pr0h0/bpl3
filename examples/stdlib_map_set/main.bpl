import [Map] from "std/map.bpl";
import [Set] from "std/set.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Map/Set Demo ===");
    local m: Map<int, int> = Map<int, int>.new(2);
    m.set(1, 10);
    m.set(2, 20);
    IO.printInt(m.get(1).unwrap());
    IO.printInt(m.get(3).unwrapOr(-1));

    local s: Set<int> = Set<int>.new(2);
    s.add(7);
    s.add(7);
    IO.printInt(s.size());
    local h1: bool = s.has(7);
    local h1i: int = 0;
    if (h1) {
        h1i = 1;
    }
    IO.printInt(h1i);
    local r1: bool = s.remove(7);
    local r1i: int = 0;
    if (r1) {
        r1i = 1;
    }
    IO.printInt(r1i);
    local h2: bool = s.has(7);
    local h2i: int = 0;
    if (h2) {
        h2i = 1;
    }
    IO.printInt(h2i);
    return 0;
}
