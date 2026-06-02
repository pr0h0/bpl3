# Test Array<T> operator overloading with << and >>

import [Array] from "../../lib/array.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    # Create an integer array
    local arr: Array<int> = Array<int>.new(5);

    # Test push with << operator
    printf("Testing push with << operator:\n");
    arr << 10;
    arr << 20;
    arr << 30;

    printf("Array length after pushes: %d\n", arr.len());
    printf("Elements: %d, %d, %d\n", arr.get(0), arr.get(1), arr.get(2));

    # Test pop with >> operator
    printf("\nTesting pop with >> operator:\n");
    local popped: int;
    arr >> &popped;
    printf("Popped value: %d\n", popped);
    printf("Array length after pop: %d\n", arr.len());

    # Pop another
    arr >> &popped;
    printf("Popped value: %d\n", popped);
    printf("Array length after pop: %d\n", arr.len());

    # Cleanup
    arr.destroy();

    printf("\n=== Array operator test passed! ===\n");
    return 0;
}
