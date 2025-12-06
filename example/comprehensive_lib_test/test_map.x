import [Map] from "../../lib/map.x";
import printf from "libc";
import assert from "./utils.x";

frame main() {
    local map: Map<u64, u64>;

    # Test Put and Get
    call map.put(1, 100);
    call map.put(2, 200);
    call map.put(3, 300);

    call assert((call map.size()) == 3, "Map size is 3");
    call assert((call map.get(1)) == 100, "Key 1 is 100");
    call assert((call map.get(2)) == 200, "Key 2 is 200");
    call assert((call map.get(3)) == 300, "Key 3 is 300");

    # Test Update
    call map.put(2, 250);
    call assert((call map.size()) == 3, "Map size is still 3");
    call assert((call map.get(2)) == 250, "Key 2 updated to 250");

    # Test Has
    call assert((call map.has(1)) == 1, "Map has key 1");
    call assert((call map.has(4)) == 0, "Map does not have key 4");
    # Test Delete
    call assert((call map.delete(2)) == 1, "Deleted key 2");
    call assert((call map.size()) == 2, "Map size is 2 after delete");
    call assert((call map.has(2)) == 0, "Map does not have key 2");
    call assert((call map.delete(5)) == 0, "Delete non-existent key 5 returns 0");

    # Test Clear
    call map.clear();
    call assert((call map.size()) == 0, "Map cleared");
    call assert((call map.has(1)) == 0, "Map does not have key 1");

    # Test with many items
    local i: u64 = 0;
    loop {
        if i >= 50 {
            break;
        }
        call map.put(i, i * 10);
        i = i + 1;
    }
    call assert((call map.size()) == 50, "Map size is 50");
    call assert((call map.get(25)) == 250, "Key 25 is 250");

    # Test Keys and Values access
    call assert((call map.keys.len()) == 50, "Keys array length is 50");
    call assert((call map.values.len()) == 50, "Values array length is 50");
    call assert((call map.keys.get(0)) == 0, "First key is 0");
    call assert((call map.values.get(0)) == 0, "First value is 0");

    call map.keys.free();
    call map.values.free();
}
