import printf from "libc";
import [Set] from "../../lib/set.x";
import [Array] from "../../lib/array.x";
import assert from "./utils.x";

frame main() {
    local set: Set<u64>;
    set.items.length = 0;
    set.items.capacity = 0;
    set.items.data = NULL;

    # Test Add
    call set.add(10);
    call set.add(20);
    call set.add(30);

    call assert((call set.size()) == 3, "Set size is 3");
    call assert((call set.has(10)) == 1, "Set has 10");
    call assert((call set.has(20)) == 1, "Set has 20");
    call assert((call set.has(40)) == 0, "Set does not have 40");

    # Test Duplicate Add
    call set.add(20);
    call assert((call set.size()) == 3, "Set size is still 3 after adding duplicate");

    # Test Delete
    call assert((call set.delete(20)) == 1, "Deleted 20");
    call assert((call set.size()) == 2, "Set size is 2");
    call assert((call set.has(20)) == 0, "Set does not have 20");
    call assert((call set.delete(50)) == 0, "Delete non-existent 50 returns 0");

    # Test Clear
    call set.clear();
    call assert((call set.size()) == 0, "Set cleared");

    # Test Values
    call set.add(1);
    call set.add(2);
    local values: *Array<u64> = call set.values();
    call assert((call values.len()) == 2, "Values array length is 2");
    call assert((call values.get(0)) == 1, "Value 0 is 1");

    call printf("Freeing set items...\n");
    call set.items.free();
    call printf("Freed set items.\n");

    # Test Large Set (Resize)
    call printf("Testing Large Set...\n");
    local largeSet: Set<u64>;
    largeSet.items.length = 0;
    largeSet.items.capacity = 0;
    largeSet.items.data = NULL;

    local i: u64 = 0;
    loop {
        if i >= 100 {
            break;
        }
        # call printf("Adding %d\n", i);
        call largeSet.add(i);
        i = i + 1;
    }
    call printf("Large Set populated.\n");
    call assert((call largeSet.size()) == 100, "Large set size is 100");
    call assert((call largeSet.has(50)) == 1, "Large set has 50");
    call assert((call largeSet.has(99)) == 1, "Large set has 99");
    call assert((call largeSet.has(100)) == 0, "Large set does not have 100");

    call largeSet.items.free();

    # Test Set<u8>
    call printf("Testing Set<u8>...\n");
    local byteSet: Set<u8>;
    byteSet.items.length = 0;
    byteSet.items.capacity = 0;
    byteSet.items.data = NULL;

    call byteSet.add(cast<u8>(255));
    call byteSet.add(cast<u8>(0));
    call assert((call byteSet.size()) == 2, "Byte set size is 2");
    call assert((call byteSet.has(cast<u8>(255))) == 1, "Byte set has 255");
    call assert((call byteSet.has(cast<u8>(0))) == 1, "Byte set has 0");
    call byteSet.items.free();
}
