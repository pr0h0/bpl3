import [Map] from "std/map.bpl";
import [Set] from "std/set.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("--- Testing Map<int, string> ---\n");
    local m: Map<int, string> = Map<int, string>.new();
    m.set(1, "one");
    m.set(2, "two");

    if (m.has(1)) {
        printf("Has 1\n");
    }
    if (m.has(2)) {
        printf("Has 2\n");
    }
    if (!m.has(3)) {
        printf("Missing 3\n");
    }
    local v2: string = m.get(2).unwrap();

    printf("Value of 2: %s\n", v2);

    printf("--- Testing Map<string, int> ---\n");
    local m2: Map<string, int> = Map<string, int>.new();
    m2.set("apple", 100);
    m2.set("banana", 200);

    if (m2.has("apple")) {
        printf("Has apple\n");
    }
    printf("Value of banana: %d\n", m2.get("banana").unwrap());

    m2.remove("apple");
    if (!m2.has("apple")) {
        printf("Removed apple\n");
    }
    printf("--- Testing Set<int> ---\n");
    local s: Set<int> = Set<int>.new();
    s.add(10);
    s.add(20);
    if (s.has(10)) {
        printf("Set has 10\n");
    }
    if (s.has(20)) {
        printf("Set has 20\n");
    }
    return 0;
}
