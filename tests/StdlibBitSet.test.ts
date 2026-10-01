import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Every size from 0 to 130 crosses a word boundary somewhere, so the masking
// of the bits past numBits in the final word is exercised in each direction.
test("bit set operations hold at every size around a word boundary", () => {
  expectCorrectnessSuite([
    {
      name: "bitset-sizes",
      validateLlvm: true,
      source: `
      import [BitSet] from "std/bitset.bpl";
      import printf from "std/c.bpl";

      frame main() ret int {
        local failures: int = 0;

        loop (local n: int = 0; n <= 130; n = n + 1) {
          local a: BitSet = BitSet.new(n);
          if (a.size() != n) { failures = failures + 1; }
          if (a.count() != 0) { failures = failures + 1; }
          if (!a.none()) { failures = failures + 1; }
          if (a.firstSet() != -1) { failures = failures + 1; }
          if (a.lastSet() != -1) { failures = failures + 1; }

          # setAll must not leave anything set past the end.
          a.setAll();
          if (a.count() != n) { failures = failures + 1; }
          if (n > 0) {
            if (!a.all()) { failures = failures + 1; }
            if (a.firstSet() != 0) { failures = failures + 1; }
            if (a.lastSet() != (n - 1)) { failures = failures + 1; }
          }

          # Flipping twice is the identity, and once from full is empty.
          a.flipAll();
          if (a.count() != 0) { failures = failures + 1; }
          a.flipAll();
          if (a.count() != n) { failures = failures + 1; }

          local copy: BitSet = a.clone();
          if (!a.equals(&copy)) { failures = failures + 1; }

          # Individual bits, including the last one in the final word.
          if (n > 0) {
            a.clearAll();
            a.set(n - 1);
            if (!a.test(n - 1)) { failures = failures + 1; }
            if (a.count() != 1) { failures = failures + 1; }
            if (a.firstSet() != (n - 1)) { failures = failures + 1; }
            a.flip(n - 1);
            if (a.test(n - 1)) { failures = failures + 1; }
            # Out-of-range indices are ignored rather than corrupting a word.
            a.set(n);
            a.set(-1);
            if (a.count() != 0) { failures = failures + 1; }
            if (a.test(n)) { failures = failures + 1; }
            if (a.test(-1)) { failures = failures + 1; }
          }

          a.destroy();
          copy.destroy();
        }

        printf("%d\\n", failures);
        return 0;
      }`,
      expectedStdout: "0\n",
    },
  ]);
}, 120000);

// numBits + 63 was rounded up in int, so a set asked for the largest
// representable number of bits wrapped to a negative word count and handed
// memset a length that became an enormous size_t. It segfaulted at O0 and O3.
test("a bit set at the extremes of its size range is not miscounted", () => {
  expectCorrectnessSuite([
    {
      name: "bitset-size-extremes",
      validateLlvm: true,
      source: `
      import [BitSet] from "std/bitset.bpl";
      import printf from "std/c.bpl";

      frame main() ret int {
        # A negative request is an empty set, not a set reporting a negative
        # size, which is what size() used to answer.
        local empty: BitSet = BitSet.new(-5);
        if (empty.size() != 0) { return 1; }
        if (empty.count() != 0) { return 2; }
        if (!empty.all()) { return 3; }
        if (empty.any()) { return 4; }
        empty.setAll();
        empty.clearAll();
        empty.flipAll();
        if (empty.count() != 0) { return 5; }
        local emptyCopy: BitSet = empty.clone();
        if (!empty.equals(&emptyCopy)) { return 6; }
        empty.destroy();
        emptyCopy.destroy();

        # 2147483647 bits is 33554432 words; the round-up used to wrap here.
        local huge: BitSet = BitSet.new(2147483647);
        if (huge.numWords != 33554432) { return 7; }
        if (huge.data == nullptr) { return 8; }
        huge.set(2147483646);
        if (!huge.test(2147483646)) { return 9; }
        if (huge.lastSet() != 2147483646) { return 10; }
        if (huge.count() != 1) { return 11; }
        huge.destroy();

        printf("extremes ok\\n");
        return 0;
      }`,
      expectedStdout: "extremes ok\n",
    },
  ]);
}, 120000);

test("destroyed bit sets retain the empty-set invariants", () => {
  expectCorrectnessSuite([{
    name: "bitset-destroyed-state",
    validateLlvm: true,
    source: `
      import [BitSet] from "std/bitset.bpl";
      frame main() ret int {
        local bits: BitSet = BitSet.new(65);
        bits.setAll();
        bits.destroy();
        if (bits.size() != 0) { return 1; }
        if (bits.numWords != 0) { return 2; }
        if (bits.data != nullptr) { return 3; }
        if ((bits.count() != 0) || bits.any() || !bits.all()) { return 4; }
        if ((bits.firstSet() != -1) || (bits.lastSet() != -1)) { return 5; }
        bits.set(0); bits.clear(0); bits.flip(0);
        bits.setAll(); bits.clearAll(); bits.flipAll();
        if (bits.test(0)) { return 6; }
        local copy: BitSet = bits.clone();
        if (!copy.equals(&bits)) { return 7; }
        copy.destroy(); bits.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
