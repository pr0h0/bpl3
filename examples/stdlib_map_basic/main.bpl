import [printf] from "std/c.bpl";
import [Map] from "std";

frame main() ret int {
    local m: Map<int, int> = Map<int, int>.new(16);
    m.set(1, 100);
    m.set(2, 200);

    if (m.has(1)) {
        printf("Has 1: %d\n", m.get(1).unwrap());
    }
    m.destroy();
    return 0;
}
