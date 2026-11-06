import printf from "std/c.bpl";
import [Array], [Map] from "std";

frame show(label: string, arr: *Array<int>) {
    printf("%s:", label);
    loop (local i: int = 0; i < arr.len(); i = i + 1) {
        printf(" %d", arr.get(i));
    }
    printf(" (empty %d)\n", cast<int>(arr.isEmpty()));
}

frame main() ret int {
    local arr: Array<int> = Array<int>.new(0);
    arr.insert(0, 2);
    arr.insert(0, 1);
    arr.insert(2, 4);
    arr.insert(2, 3);
    show("inserted", &arr);
    try {
        arr.insert(9, 9);
    } catch {
        printf("insert out of range throws\n");
    }
    arr.clear();
    show("cleared", &arr);
    arr.push(7);
    show("reused", &arr);
    arr.destroy();

    local scores: Map<string, int> = Map<string, int>.new(4);
    scores.set("ada", 3);
    scores.set("bob", 5);
    scores.set("cy", 8);
    printf("getOr ada %d, eve %d\n", scores.getOr("ada", -1), scores.getOr("eve", -1));
    local keys: Array<string> = scores.keys();
    local values: Array<int> = scores.values();
    local total: int = 0;
    loop (local i: int = 0; i < values.len(); i = i + 1) {
        total = total + values.get(i);
    }
    printf("%d keys, values sum %d, first key matches first value %d\n", keys.len(), total, cast<int>(scores.getOr(keys.get(0), -1) == values.get(0)));
    keys.destroy();
    values.destroy();
    scores.destroy();
    return 0;
}
