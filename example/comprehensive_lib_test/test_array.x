import [Array] from "../../lib/array.x";
import printf from "libc";
import assert from "./utils.x";

frame main() {
    local arr: Array<u64>;

    # Test Push and Get
    call arr.push(10);
    call arr.push(20);
    call arr.push(30);

    call assert((call arr.len()) == 3, "Array length is 3");
    call assert((call arr.get(0)) == 10, "Element 0 is 10");
    call assert((call arr.get(1)) == 20, "Element 1 is 20");
    call assert((call arr.get(2)) == 30, "Element 2 is 30");

    # Test Set
    call arr.set(1, 25);
    call assert((call arr.get(1)) == 25, "Element 1 set to 25");
    # Test Pop
    local val: u64 = call arr.pop();
    call assert(val == 30, "Popped value is 30");
    call assert((call arr.len()) == 2, "Array length is 2 after pop");
    # Test RemoveAt (middle)
    # Current: [10, 25]
    call arr.push(40);
    call arr.push(50);
    # Current: [10, 25, 40, 50]
    call arr.removeAt(1);
    # Expected: [10, 40, 50]
    call assert((call arr.len()) == 3, "Array length is 3 after removeAt");
    call assert((call arr.get(0)) == 10, "Element 0 is 10");
    call assert((call arr.get(1)) == 40, "Element 1 is 40");
    call assert((call arr.get(2)) == 50, "Element 2 is 50");

    # Test RemoveAt (start)
    call arr.removeAt(0);
    # Expected: [40, 50]
    call assert((call arr.get(0)) == 40, "Element 0 is 40 after removeAt(0)");

    # Test RemoveAt (end)
    call arr.removeAt(1);
    # Expected: [40]
    call assert((call arr.len()) == 1, "Array length is 1");
    call assert((call arr.get(0)) == 40, "Element 0 is 40");

    # Test Clear
    call arr.clear();
    call assert((call arr.len()) == 0, "Array cleared");

    # Test Resizing (push many)
    local i: u64 = 0;
    loop {
        if i >= 100 {
            break;
        }
        call arr.push(i);
        i = i + 1;
    }
    call assert((call arr.len()) == 100, "Array length is 100");
    call assert((call arr.get(50)) == 50, "Element 50 is 50");
    call assert((call arr.get(99)) == 99, "Element 99 is 99");

    call arr.free();
}
