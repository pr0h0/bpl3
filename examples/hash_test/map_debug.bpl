import [Map] from "std/map.bpl";
import [Hashable] from "std/core_specs.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

struct Key: Hashable<Key> {
    id: int,
    frame hash(this: *Key) ret u64 {
        return cast<u64>(this.id);
    }
    frame __eq__(this: *Key, other: *Key) ret bool {
        return this.id == other.id;
    }
}

frame main() ret int {
    local k: Key;
    k.id = 123;

    local m: Map<Key, int> = Map<Key, int>.new(16);
    m.set(k, 456);

    if (m.has(k)) {
        printf("Found key\n");
    }
    m.destroy();
    return 0;
}
