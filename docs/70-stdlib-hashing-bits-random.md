# Hashing, Bit Manipulation and Random Numbers

## Hashes and checksums (`std/hash.bpl`)

`Hash` gathers non-cryptographic hashes and checksums as static methods.
Byte-oriented functions take a `*u8` pointer and a `long` length; string
helpers read a null-terminated string.

| Function                              | Algorithm                                   |
| ------------------------------------- | ------------------------------------------- |
| `fnv1a32`, `fnv1a64` (string)         | FNV-1a                                      |
| `fnv1a32Bytes`, `fnv1a64Bytes`        | FNV-1a over bytes                           |
| `djb2(text)`                          | Bernstein `hash * 33 + byte`                |
| `xxhash32(data, len, seed)`           | xxHash32                                    |
| `xxhash64(data, len, seed)`           | xxHash64                                    |
| `xxhash32String`, `xxhash64String`    | xxHash with seed 0                          |
| `murmur3_32(data, len, seed)`         | MurmurHash3 x86 32-bit                      |
| `siphash24(key0, key1, data, len)`    | SipHash-2-4 with a 128-bit key              |
| `crc32`, `crc32Update`, `crc32String` | CRC-32 (IEEE, as in zlib, gzip, PNG)        |
| `crc32c`, `crc32cUpdate`              | CRC-32C (Castagnoli)                        |
| `adler32`                             | Adler-32 (zlib stream checksum)             |
| `checksum32`, `combine32`             | Additive checksum and a hash-combining step |

The `Update` forms continue a checksum: `crc32cUpdate(crc32c(a), b)` equals the
CRC-32C of `a` followed by `b`. SipHash is a keyed hash for tables that receive
untrusted keys; none of these functions is a cryptographic digest (see
`std/sha256.bpl` and `std/hmac.bpl` for those).

```bpl
import [Hash] from "std/hash.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    printf("%08x\n", Hash.crc32c(cast<*u8>("123456789"), 9)); # e3069283
    printf("%016lx\n", Hash.xxhash64String("abc")); # 44bc2cf5ad770999
    return 0;
}
```

## Bit manipulation (`std/bits.bpl`)

`Bits` provides 32- and 64-bit helpers on unsigned values (signed values can be
cast; the bit pattern is used):

- Counting: `popCount32/64`, `leadingZeros32/64`, `trailingZeros32/64`,
  `parity32/64`, `highestBit32/64` and `lowestBit32/64` (both -1 for zero).
- Reordering: `rotateLeft32/64` and `rotateRight32/64` (count reduced modulo
  the width), `byteSwap32/64`, `reverseBits32/64`.
- Powers of two: `isPowerOfTwo64`, `nextPowerOfTwo64` (throws above 2^63),
  `isolateLowest64`.
- Fields: `mask64(width)`, `extract64(value, offset, width)`,
  `insert64(value, offset, width, field)`, `testBit64`, `setBit64`,
  `clearBit64`, `toggleBit64` (out-of-range indexes leave the value
  unchanged), `signExtend64(value, width)`.
- Codes: `interleave(x, y)` (Morton/Z-order), `toGray64`, `fromGray64`.
- `toBinary64(value, width)` returns a newly allocated `'0'`/`'1'` string.

## Random numbers (`std/rand.bpl`)

`Rand` is the seeded PCG32 generator. Besides the existing integer, float,
range, shuffle and choice methods it offers:

- `nextBelow(bound)`: an unbiased `ulong` in `[0, bound)`; `rangeLong(min, max)`.
- `nextUnit()`: a double in `[0, 1)` with 53 random bits.
- Distributions: `nextBernoulli(p)`, `nextNormal(mean, stddev)`,
  `nextExponential(rate)`, `nextPoisson(mean)` (exact below a mean of 30,
  rounded normal approximation above), `nextBinomial(trials, p)`.
- `sample<T>(&array, count)`: `count` distinct elements in random order, in a
  new array the caller destroys.

`Xoshiro256` (xoshiro256\*\*) is a faster 64-bit generator with period
2^256 - 1. `Xoshiro256.seed(n)` expands the seed with `SplitMix64`, which is
also exported. It provides `nextULong`, `nextLong`, `nextUInt`, `nextFloat`,
`nextBool`, `nextBelow`, `range`, `shuffle<T>` and `jump()`, which advances
2^128 steps to create non-overlapping streams for parallel work. None of these
generators is cryptographically secure; use `std/entropy.bpl` for secrets.

```bpl
import [Xoshiro256] from "std/rand.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local generator: Xoshiro256 = Xoshiro256.seed(cast<ulong>(42));
    printf("%016lx\n", generator.nextULong()); # 15780b2e0c2ec716
    printf("%d\n", generator.range(1, 7) >= 1); # 1
    return 0;
}
```
