import [Map] from "std/map.bpl";
import [Set] from "std/set.bpl";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";

extern printf(fmt: string, ...) ret int;

frame strHash(s: *String) ret u64 {
    return s.hash();
}

frame strEq(a: *String, b: *String) ret bool {
    return *a == *b;
}

frame main() ret int {
    # Test Map
    printf("Testing HashMap...\n");
    local m: Map<String, int> = Map<String, int>.new(16, strHash, strEq);

    local k1: String = String.new("hello");
    local k2: String = String.new("world");
    local k3: String = String.new("foo");

    m.set(k1, 42);
    m.set(k2, 100);

    if (m.has(k1)) {
        printf("Has hello\n");
    } else {
        printf("Missing hello\n");
    }
    if (m.has(k2)) {
        printf("Has world\n");
    } else {
        printf("Missing world\n");
    }
    if (!m.has(k3)) {
        printf("Missing foo (correct)\n");
    } else {
        printf("Has foo (incorrect)\n");
    }

    local v1: Option<int> = m.get(k1);
    printf("hello = %d\n", v1.unwrap());

    m.remove(k1);
    if (!m.has(k1)) {
        printf("Removed hello\n");
    } else {
        printf("Failed remove\n");
    }

    m.destroy();

    # Test Set
    printf("Testing HashSet...\n");
    local s: Set<String> = Set<String>.new(16, strHash, strEq);
    s.add(k2);
    s.add(k3);

    if (s.has(k2)) {
        printf("Set has world\n");
    }
    if (s.has(k3)) {
        printf("Set has foo\n");
    }
    s.destroy();
    k1.destroy();
    k2.destroy();
    k3.destroy();

    return 0;
}
