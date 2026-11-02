import printf from "std/c.bpl";
import [Set] from "std/set.bpl";
import [Array] from "std/array.bpl";

frame main() ret int {
    local small: Set<int> = Set<int>.new();
    local big: Set<int> = Set<int>.new();
    local empty: Set<int> = Set<int>.new();
    small.add(2);
    small.add(3);
    big.add(1);
    big.add(2);
    big.add(3);
    printf("empty: %d %d\n", cast<int>(empty.isEmpty()), cast<int>(small.isEmpty()));
    printf("small in big: %d, big in small: %d\n", cast<int>(small.isSubsetOf(&big)), cast<int>(big.isSubsetOf(&small)));
    printf("empty in small: %d, small in itself: %d\n", cast<int>(empty.isSubsetOf(&small)), cast<int>(small.isSubsetOf(&small)));
    small.add(9);
    printf("after adding 9, small in big: %d\n", cast<int>(small.isSubsetOf(&big)));

    local items: Array<int> = big.toArray();
    local sum: int = 0;
    loop (local i: int = 0; i < items.len(); i = i + 1) {
        sum = sum + items.get(i);
    }
    printf("toArray: %d items, sum %d\n", items.len(), sum);
    items.destroy();
    small.destroy();
    big.destroy();
    empty.destroy();
    return 0;
}
