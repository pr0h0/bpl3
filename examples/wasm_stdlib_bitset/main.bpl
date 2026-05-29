import [BitSet] from "std/bitset.bpl";

frame main() ret int {
    local bits: BitSet = BitSet.new(96);
    bits.set(1);
    bits.set(64);
    bits.set(95);
    bits.flip(64);

    if (!bits.test(1)) {
        bits.destroy();
        return 1;
    }
    if (bits.test(64)) {
        bits.destroy();
        return 2;
    }
    if (bits.count() != 2) {
        bits.destroy();
        return 3;
    }

    local copy: BitSet = bits.clone();
    bits.clearAll();
    if (!copy.test(95)) {
        bits.destroy();
        copy.destroy();
        return 4;
    }
    if (bits.any()) {
        bits.destroy();
        copy.destroy();
        return 5;
    }

    bits.destroy();
    copy.destroy();
    return 0;
}
