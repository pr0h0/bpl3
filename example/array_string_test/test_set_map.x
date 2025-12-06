import printf from "libc";
import [Array] from "../../lib/array.x";
import [Set] from "../../lib/set.x";
import [Map] from "../../lib/map.x";

frame main() {
    # Test Set with duplicate checking
    call printf("=== Testing Set<u64> ===\n");
    local numSet: Set<u64>;
    numSet.items.length = 0;
    numSet.items.capacity = 0;
    numSet.items.data = cast<*u64>(0);

    call printf("Adding 10, 20, 30, 20 (duplicate)\n");
    call numSet.add(10);
    call numSet.add(20);
    call numSet.add(30);
    call numSet.add(20); # This should not be added (duplicate)

    call printf("Set size: %llu\n", call numSet.size());
    call printf("Has 20: %d\n", call numSet.has(20));
    call printf("Has 40: %d\n", call numSet.has(40));

    call printf("Deleting 20\n");
    call numSet.delete(20);
    call printf("Set size after delete: %llu\n", call numSet.size());
    call printf("Has 20 after delete: %d\n", call numSet.has(20));

    # Test Map with key updates
    call printf("\n=== Testing Map<u64, u64> ===\n");
    local numMap: Map<u64, u64>;
    numMap.keys.length = 0;
    numMap.keys.capacity = 0;
    numMap.keys.data = cast<*u64>(0);
    numMap.values.length = 0;
    numMap.values.capacity = 0;
    numMap.values.data = cast<*u64>(0);

    call printf("Putting (1, 100), (2, 200), (1, 150) - updates key 1\n");
    call numMap.put(1, 100);
    call numMap.put(2, 200);
    call numMap.put(1, 150); # This should update value for key 1

    call printf("Map size: %llu\n", call numMap.size());
    call printf("Get key 1: %llu\n", call numMap.get(1));
    call printf("Get key 2: %llu\n", call numMap.get(2));
    call printf("Has key 1: %d\n", call numMap.has(1));
    call printf("Has key 3: %d\n", call numMap.has(3));

    call printf("Deleting key 1\n");
    call numMap.delete(1);
    call printf("Map size after delete: %llu\n", call numMap.size());
    call printf("Has key 1 after delete: %d\n", call numMap.has(1));
}
