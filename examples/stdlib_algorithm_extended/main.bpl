# Extended Algorithm Library Test

import [Algorithm], [Array], [Rand] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame printIntArray(arr: *Array<int>, label: string) {
    printf("%s: [", label);
    local i: int = 0;
    loop (i < arr.len()) {
        if (i > 0) 
            printf(", ");
        printf("%d", arr.get(i));
        i = i + 1;
    }
    printf("]\n");
}

frame printFloatArray(arr: *Array<float>, label: string) {
    printf("%s: [", label);
    local i: int = 0;
    loop (i < arr.len()) {
        if (i > 0) 
            printf(", ");
        printf("%.1f", arr.get(i));
        i = i + 1;
    }
    printf("]\n");
}

frame main() ret int {
    printf("=== Extended Algorithm Library Test ===\n\n");

    # Create test array
    local arr: Array<int> = Array<int>.new(10);
    arr.push(5);
    arr.push(2);
    arr.push(8);
    arr.push(1);
    arr.push(9);
    arr.push(3);
    arr.push(7);
    arr.push(4);
    arr.push(6);

    printIntArray(&arr, "Original array");

    # Test min/max/sum
    printf("\n--- Statistics ---\n");
    printf("min: %d\n", Algorithm.minInt(&arr));
    printf("max: %d\n", Algorithm.maxInt(&arr));
    printf("sum: %ld\n", Algorithm.sumInt(&arr));
    printf("average: %.2f\n", Algorithm.averageInt(&arr));

    # Test sorting
    printf("\n--- Sorting ---\n");
    local sortedAsc: Array<int> = arr.clone();
    Algorithm.sortIntAsc(&sortedAsc);
    printIntArray(&sortedAsc, "Sorted ascending");

    local sortedDesc: Array<int> = arr.clone();
    Algorithm.sortIntDesc(&sortedDesc);
    printIntArray(&sortedDesc, "Sorted descending");

    # Test quick sort
    local quickSorted: Array<int> = arr.clone();
    Algorithm.quickSortInt(&quickSorted);
    printIntArray(&quickSorted, "Quick sorted");

    # Test binary search
    printf("\n--- Binary Search ---\n");
    printf("Binary search for 5: index %d\n", Algorithm.binarySearchInt(&sortedAsc, 5));
    printf("Binary search for 1: index %d\n", Algorithm.binarySearchInt(&sortedAsc, 1));
    printf("Binary search for 9: index %d\n", Algorithm.binarySearchInt(&sortedAsc, 9));
    printf("Binary search for 10: index %d\n", Algorithm.binarySearchInt(&sortedAsc, 10));

    # Test reverse
    printf("\n--- Reverse ---\n");
    local reversed: Array<int> = arr.clone();
    Algorithm.reverseInt(&reversed);
    printIntArray(&reversed, "Reversed");

    # Test isSorted
    printf("\n--- Is Sorted Check ---\n");
    printf("Original is sorted: %d\n", cast<int>(Algorithm.isSortedInt(&arr)));
    printf("Sorted array is sorted: %d\n", cast<int>(Algorithm.isSortedInt(&sortedAsc)));

    # Test shuffle
    printf("\n--- Shuffle ---\n");
    local rng: Rand = Rand.seed(42);
    local toShuffle: Array<int> = sortedAsc.clone();
    Algorithm.shuffleInt(&toShuffle, &rng);
    printIntArray(&toShuffle, "Shuffled");

    # Test unique
    printf("\n--- Unique ---\n");
    local withDupes: Array<int> = Array<int>.new(10);
    withDupes.push(1);
    withDupes.push(2);
    withDupes.push(2);
    withDupes.push(3);
    withDupes.push(3);
    withDupes.push(3);
    withDupes.push(4);
    printIntArray(&withDupes, "With duplicates");
    local unique: Array<int> = Algorithm.uniqueInt(&withDupes);
    printIntArray(&unique, "Unique values");

    # Test count
    printf("\n--- Count ---\n");
    printf("Count of 3 in withDupes: %d\n", Algorithm.countInt(&withDupes, 3));
    printf("Count of 5 in withDupes: %d\n", Algorithm.countInt(&withDupes, 5));

    # Test range generation
    printf("\n--- Range Generation ---\n");
    local range1: Array<int> = Algorithm.rangeInt(0, 5);
    printIntArray(&range1, "range(0, 5)");

    local range2: Array<int> = Algorithm.rangeIntStep(0, 10, 2);
    printIntArray(&range2, "range(0, 10, step=2)");

    local range3: Array<int> = Algorithm.rangeIntStep(10, 0, -2);
    printIntArray(&range3, "range(10, 0, step=-2)");

    # Test merge
    printf("\n--- Merge ---\n");
    local a: Array<int> = Array<int>.new(3);
    a.push(1);
    a.push(2);
    a.push(3);
    local b: Array<int> = Array<int>.new(3);
    b.push(4);
    b.push(5);
    b.push(6);
    local merged: Array<int> = Algorithm.mergeInt(&a, &b);
    printIntArray(&merged, "Merged [1,2,3] + [4,5,6]");

    # Test equals
    printf("\n--- Equality Check ---\n");
    local c: Array<int> = a.clone();
    printf("a equals c (clone): %d\n", cast<int>(Algorithm.equalsInt(&a, &c)));
    printf("a equals b: %d\n", cast<int>(Algorithm.equalsInt(&a, &b)));

    # Test float operations
    printf("\n--- Float Array Operations ---\n");
    local floats: Array<float> = Array<float>.new(5);
    floats.push(3.5);
    floats.push(1.2);
    floats.push(4.8);
    floats.push(2.1);
    floats.push(5.9);
    printFloatArray(&floats, "Float array");
    printf("min: %.1f\n", Algorithm.minFloat(&floats));
    printf("max: %.1f\n", Algorithm.maxFloat(&floats));
    printf("sum: %.1f\n", Algorithm.sumFloat(&floats));
    printf("average: %.2f\n", Algorithm.averageFloat(&floats));

    Algorithm.sortFloatAsc(&floats);
    printFloatArray(&floats, "Sorted floats");

    # Cleanup
    arr.destroy();
    sortedAsc.destroy();
    sortedDesc.destroy();
    quickSorted.destroy();
    reversed.destroy();
    toShuffle.destroy();
    withDupes.destroy();
    unique.destroy();
    range1.destroy();
    range2.destroy();
    range3.destroy();
    a.destroy();
    b.destroy();
    c.destroy();
    merged.destroy();
    floats.destroy();

    printf("\n=== All Algorithm Tests Passed! ===\n");
    return 0;
}
