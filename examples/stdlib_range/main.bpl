# Range demonstration

import [printf] from "std/c.bpl";

import [Range] from "std/range.bpl";

frame main() ret int {
    printf("=== Range Tests ===\n\n");

    # Test basic range
    printf("--- Basic Range (0 to 10) ---\n");
    local r1: Range = Range.until(10);
    printf("Range: 0 to 10 (exclusive)\n");
    printf("Length: %d\n", r1.len());
    printf("Contains 5: %d\n", r1.contains(5));
    printf("Contains 10: %d\n", r1.contains(10));
    printf("Element at index 0: %d\n", r1[0]);
    printf("Element at index 5: %d\n", r1[5]);
    printf("Element at index 9: %d\n", r1[9]);
    printf("\n");

    # Test range with step
    printf("--- Range with Step (0 to 20, step 2) ---\n");
    local r2: Range = Range.new(0, 20, 2);
    printf("Length: %d\n", r2.len());
    printf("Contains 4: %d\n", r2.contains(4));
    printf("Contains 5: %d\n", r2.contains(5));
    local i: int = 0;
    printf("Elements: ");
    loop (i < r2.len()) {
        printf("%d ", r2[i]);
        i = i + 1;
    }
    printf("\n\n");

    # Test reverse range
    printf("--- Reverse Range (10 down to 0) ---\n");
    local r3: Range = Range.new(10, -1, -1);
    printf("Length: %d\n", r3.len());
    i = 0;
    printf("Elements: ");
    loop (i < r3.len()) {
        printf("%d ", r3[i]);
        i = i + 1;
    }
    printf("\n\n");

    # Test range equality
    printf("--- Range Equality ---\n");
    local r4: Range = Range.between(5, 15);
    local r5: Range = Range.between(5, 15);
    local r6: Range = Range.between(5, 16);
    printf("Range(5, 15) == Range(5, 15): %d\n", r4 == r5);
    printf("Range(5, 15) == Range(5, 16): %d\n", r4 == r6);
    printf("Range(5, 15) != Range(5, 16): %d\n", r4 != r6);
    printf("\n");

    # Test inclusive range
    printf("--- Inclusive Range (1 to 5 inclusive) ---\n");
    local r7: Range = Range.betweenInclusive(1, 5);
    printf("Length: %d\n", r7.len());
    i = 0;
    printf("Elements: ");
    loop (i < r7.len()) {
        printf("%d ", r7[i]);
        i = i + 1;
    }
    printf("\n\n");

    printf("=== All Range Tests Complete ===\n");
    return 0;
}
