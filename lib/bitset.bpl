# BitSet - Fixed-size bit array for efficient flag/set operations

export [BitSet];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memset(dest: *void, c: int, n: long) ret *void;
extern memcpy(dest: *void, src: *void, n: long) ret *void;

# BitSet with dynamic size
struct BitSet {
    data: *u64,
    numBits: int,
    numWords: int,
    # Create a new BitSet with the specified number of bits
    frame new(numBits: int) ret BitSet {
        local bs: BitSet;
        bs.numBits = numBits;
        bs.numWords = (numBits + 63) / 64;
        bs.data = cast<*u64>(malloc(cast<long>(bs.numWords) * cast<long>(8)));
        memset(cast<*void>(bs.data), 0, cast<long>(bs.numWords) * cast<long>(8));
        return bs;
    }

    # Destroy and free memory
    frame destroy(this: *BitSet) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
    }

    # Set a bit at the given index
    frame set(this: *BitSet, index: int) {
        if ((index < 0) || (index >= this.numBits)) {
            return;
        }
        local wordIdx: int = index / 64;
        local bitIdx: int = index % 64;
        local ptr: *u64 = this.data + wordIdx;
        *ptr = *ptr | (cast<u64>(1) << cast<u64>(bitIdx));
    }

    # Clear a bit at the given index
    frame clear(this: *BitSet, index: int) {
        if ((index < 0) || (index >= this.numBits)) {
            return;
        }
        local wordIdx: int = index / 64;
        local bitIdx: int = index % 64;
        local ptr: *u64 = this.data + wordIdx;
        *ptr = *ptr & ~(cast<u64>(1) << cast<u64>(bitIdx));
    }

    # Test if a bit is set
    frame test(this: *BitSet, index: int) ret bool {
        if ((index < 0) || (index >= this.numBits)) {
            return false;
        }
        local wordIdx: int = index / 64;
        local bitIdx: int = index % 64;
        local ptr: *u64 = this.data + wordIdx;
        return (*ptr & (cast<u64>(1) << cast<u64>(bitIdx))) != cast<u64>(0);
    }

    # Toggle a bit at the given index
    frame flip(this: *BitSet, index: int) {
        if ((index < 0) || (index >= this.numBits)) {
            return;
        }
        local wordIdx: int = index / 64;
        local bitIdx: int = index % 64;
        local ptr: *u64 = this.data + wordIdx;
        *ptr = *ptr ^ (cast<u64>(1) << cast<u64>(bitIdx));
    }

    # Flip all bits
    frame flipAll(this: *BitSet) {
        local i: int = 0;
        loop (i < this.numWords) {
            local ptr: *u64 = this.data + i;
            *ptr = ~*ptr;
            i = i + 1;
        }
        # Clear excess bits in last word
        this.clearExcessBits();
    }

    # Set all bits to 1
    frame setAll(this: *BitSet) {
        memset(cast<*void>(this.data), 255, cast<long>(this.numWords) * cast<long>(8));
        this.clearExcessBits();
    }

    # Clear all bits to 0
    frame clearAll(this: *BitSet) {
        memset(cast<*void>(this.data), 0, cast<long>(this.numWords) * cast<long>(8));
    }

    # Clear excess bits in the last word (bits beyond numBits)
    frame clearExcessBits(this: *BitSet) {
        local excessBits: int = (this.numWords * 64) - this.numBits;
        if ((excessBits > 0) && (this.numWords > 0)) {
            local validBits: int = 64 - excessBits;
            local mask: u64 = (cast<u64>(1) << cast<u64>(validBits)) - cast<u64>(1);
            local ptr: *u64 = this.data + (this.numWords - 1);
            *ptr = *ptr & mask;
        }
    }

    # Count the number of set bits (population count)
    frame count(this: *BitSet) ret int {
        local total: int = 0;
        local i: int = 0;
        loop (i < this.numWords) {
            local ptr: *u64 = this.data + i;
            local word: u64 = *ptr;
            # Brian Kernighan's algorithm
            loop (word != cast<u64>(0)) {
                word = word & (word - cast<u64>(1));
                total = total + 1;
            }
            i = i + 1;
        }
        return total;
    }

    # Check if all bits are set
    frame all(this: *BitSet) ret bool {
        return this.count() == this.numBits;
    }

    # Check if any bit is set
    frame any(this: *BitSet) ret bool {
        local i: int = 0;
        loop (i < this.numWords) {
            local ptr: *u64 = this.data + i;
            if (*ptr != cast<u64>(0)) {
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    # Check if no bits are set
    frame none(this: *BitSet) ret bool {
        return !this.any();
    }

    # Get the size (number of bits)
    frame size(this: *BitSet) ret int {
        return this.numBits;
    }

    # Find the first set bit, returns -1 if none
    frame firstSet(this: *BitSet) ret int {
        local i: int = 0;
        loop (i < this.numWords) {
            local ptr: *u64 = this.data + i;
            if (*ptr != cast<u64>(0)) {
                # Find first set bit in this word
                local word: u64 = *ptr;
                local bit: int = 0;
                loop (bit < 64) {
                    if ((word & (cast<u64>(1) << cast<u64>(bit))) != cast<u64>(0)) {
                        local idx: int = (i * 64) + bit;
                        if (idx < this.numBits) {
                            return idx;
                        }
                        return -1;
                    }
                    bit = bit + 1;
                }
            }
            i = i + 1;
        }
        return -1;
    }

    # Find the last set bit, returns -1 if none
    frame lastSet(this: *BitSet) ret int {
        local i: int = this.numWords - 1;
        loop (i >= 0) {
            local ptr: *u64 = this.data + i;
            if (*ptr != cast<u64>(0)) {
                local word: u64 = *ptr;
                local bit: int = 63;
                loop (bit >= 0) {
                    if ((word & (cast<u64>(1) << cast<u64>(bit))) != cast<u64>(0)) {
                        local idx: int = (i * 64) + bit;
                        if (idx < this.numBits) {
                            return idx;
                        }
                    }
                    bit = bit - 1;
                }
            }
            i = i - 1;
        }
        return -1;
    }

    # Bitwise AND with another BitSet (in-place)
    frame andWith(this: *BitSet, other: *BitSet) {
        local minWords: int = this.numWords;
        if (other.numWords < minWords) {
            minWords = other.numWords;
        }
        local i: int = 0;
        loop (i < minWords) {
            local ptr1: *u64 = this.data + i;
            local ptr2: *u64 = other.data + i;
            *ptr1 = *ptr1 & *ptr2;
            i = i + 1;
        }
        # Clear remaining words if this is larger
        loop (i < this.numWords) {
            local ptr: *u64 = this.data + i;
            *ptr = cast<u64>(0);
            i = i + 1;
        }
    }

    # Bitwise OR with another BitSet (in-place)
    frame orWith(this: *BitSet, other: *BitSet) {
        local minWords: int = this.numWords;
        if (other.numWords < minWords) {
            minWords = other.numWords;
        }
        local i: int = 0;
        loop (i < minWords) {
            local ptr1: *u64 = this.data + i;
            local ptr2: *u64 = other.data + i;
            *ptr1 = *ptr1 | *ptr2;
            i = i + 1;
        }
        this.clearExcessBits();
    }

    # Bitwise XOR with another BitSet (in-place)
    frame xorWith(this: *BitSet, other: *BitSet) {
        local minWords: int = this.numWords;
        if (other.numWords < minWords) {
            minWords = other.numWords;
        }
        local i: int = 0;
        loop (i < minWords) {
            local ptr1: *u64 = this.data + i;
            local ptr2: *u64 = other.data + i;
            *ptr1 = *ptr1 ^ *ptr2;
            i = i + 1;
        }
        this.clearExcessBits();
    }

    # Check if two BitSets are equal
    frame equals(this: *BitSet, other: *BitSet) ret bool {
        if (this.numBits != other.numBits) {
            return false;
        }
        local i: int = 0;
        loop (i < this.numWords) {
            local ptr1: *u64 = this.data + i;
            local ptr2: *u64 = other.data + i;
            if (*ptr1 != *ptr2) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    # Clone this BitSet
    frame clone(this: *BitSet) ret BitSet {
        local bs: BitSet = BitSet.new(this.numBits);
        memcpy(cast<*void>(bs.data), cast<*void>(this.data), cast<long>(this.numWords) * cast<long>(8));
        return bs;
    }
}
