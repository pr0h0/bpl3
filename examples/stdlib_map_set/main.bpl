import [Map] from "std/map.bpl";
import [Set] from "std/set.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.log("=== Map/Set Demo ===");

    # Int Map
    local m: Map<int, int> = Map<int, int>.new(16);
    m.set(1, 10);
    m.set(2, 20);
    if (m.get(1).unwrap() == 10) {
        IO.log("Map Get(1): 10");
    }
    if (m.get(3).isNone()) {
        IO.log("Map Get(3): None");
    }
    m.destroy();

    # Set<int>
    local s: Set<int> = Set<int>.new(16);
    s.add(7);
    s.add(7); # Duplicate
    s.add(42);

    printf("Set Size: %d\n", s.size());
    if (s.has(7)) {
        IO.log("Set Has 7: Yes");
    }
    s.remove(7);
    if (!s.has(7)) {
        IO.log("Set Has 7 After Remove: No");
    }
    s.destroy();

    # Set<String>
    local s2: Set<String> = Set<String>.new(16);
    local val1: String = String.new("hello");
    local val2: String = String.new("world");

    s2.add(val1);
    s2.add(val2);
    # s2.add(val1); # Duplicate logic in Set might just overwrite or check generic equality

    printf("String Set Size: %d\n", s2.size());

    local key: String = String.new("world");
    if (s2.has(key)) {
        IO.log("Set Has 'world': Yes");
    }
    key.destroy();

    val1.destroy();
    val2.destroy();
    s2.destroy();

    return 0;
}
