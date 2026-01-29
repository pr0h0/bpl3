# BitSet Test Example

import [BitSet] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== BitSet Test ===\n\n");

    # Create a bitset with 100 bits
    printf("--- Basic Operations ---\n");
    local bs: BitSet = BitSet.new(100);
    printf("Created BitSet with %d bits\n", bs.size());
    printf("Initial count of set bits: %d\n", bs.count());
    printf("Is none set: %d\n", cast<int>(bs.none()));

    # Set some bits
    bs.set(0);
    bs.set(5);
    bs.set(10);
    bs.set(50);
    bs.set(99);
    printf("\nAfter setting bits 0, 5, 10, 50, 99:\n");
    printf("Count: %d\n", bs.count());
    printf("Bit 0: %d\n", cast<int>(bs.test(0)));
    printf("Bit 5: %d\n", cast<int>(bs.test(5)));
    printf("Bit 7: %d\n", cast<int>(bs.test(7)));
    printf("Bit 99: %d\n", cast<int>(bs.test(99)));

    # Test first/last set
    printf("\nFirst set bit: %d\n", bs.firstSet());
    printf("Last set bit: %d\n", bs.lastSet());

    # Clear a bit
    printf("\n--- Clear and Flip ---\n");
    bs.clear(5);
    printf("After clearing bit 5, count: %d\n", bs.count());
    printf("Bit 5: %d\n", cast<int>(bs.test(5)));

    # Flip a bit
    bs.flip(5);
    printf("After flipping bit 5, bit 5: %d\n", cast<int>(bs.test(5)));
    bs.flip(5);
    printf("After flipping again, bit 5: %d\n", cast<int>(bs.test(5)));

    # Test any/none/all
    printf("\n--- Any/None/All ---\n");
    printf("Any set: %d\n", cast<int>(bs.any()));
    printf("None set: %d\n", cast<int>(bs.none()));
    printf("All set: %d\n", cast<int>(bs.all()));

    # Set all bits
    printf("\n--- SetAll/ClearAll ---\n");
    bs.setAll();
    printf("After setAll, count: %d\n", bs.count());
    printf("All set: %d\n", cast<int>(bs.all()));

    bs.clearAll();
    printf("After clearAll, count: %d\n", bs.count());
    printf("None set: %d\n", cast<int>(bs.none()));

    # Bitwise operations
    printf("\n--- Bitwise Operations ---\n");
    local bs1: BitSet = BitSet.new(32);
    local bs2: BitSet = BitSet.new(32);

    bs1.set(0);
    bs1.set(1);
    bs1.set(2);
    bs2.set(1);
    bs2.set(2);
    bs2.set(3);

    printf("bs1 bits set: 0, 1, 2 (count=%d)\n", bs1.count());
    printf("bs2 bits set: 1, 2, 3 (count=%d)\n", bs2.count());

    local bs3: BitSet = bs1.clone();
    bs3.andWith(&bs2);
    printf("bs1 AND bs2 count: %d (expected 2: bits 1,2)\n", bs3.count());

    local bs4: BitSet = bs1.clone();
    bs4.orWith(&bs2);
    printf("bs1 OR bs2 count: %d (expected 4: bits 0,1,2,3)\n", bs4.count());

    local bs5: BitSet = bs1.clone();
    bs5.xorWith(&bs2);
    printf("bs1 XOR bs2 count: %d (expected 2: bits 0,3)\n", bs5.count());

    # Equality
    printf("\n--- Equality ---\n");
    local bsA: BitSet = BitSet.new(64);
    local bsB: BitSet = BitSet.new(64);
    bsA.set(10);
    bsB.set(10);
    printf("bsA equals bsB: %d\n", cast<int>(bsA.equals(&bsB)));
    bsB.set(20);
    printf("After bsB.set(20), equals: %d\n", cast<int>(bsA.equals(&bsB)));

    # Cleanup
    bs.destroy();
    bs1.destroy();
    bs2.destroy();
    bs3.destroy();
    bs4.destroy();
    bs5.destroy();
    bsA.destroy();
    bsB.destroy();

    printf("\n=== BitSet Test Complete ===\n");
    return 0;
}
