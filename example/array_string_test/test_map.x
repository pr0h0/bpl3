import printf from "libc";
import [Array] from "../../lib/array.x";
import [Map] from "../../lib/map.x";

frame main() {
    # Test Map with key updates  
    call printf("=== Testing Map<u64, u64> ===\n");
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

    call printf("Expected: size=2, key 1=150 (updated), key 2=200\n");
}
