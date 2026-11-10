import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expected values come from independent reference implementations of
// xxHash32/64, MurmurHash3 x86_32, CRC-32C, SipHash-2-4, SplitMix64 and
// xoshiro256**, and agree with their published test vectors.

it("matches reference hash and checksum values", () => {
  expectCorrectnessSuite([
    {
      name: "hash vectors",
      validateLlvm: true,
      expectedStdout: [
        "02cc5d05 ef46db3751d8e999 00000000 087fcd5c 00000000",
        "550d7456 d24ec4f1a98c6e5b 3c2569b2 b2e5a263 c1d04330",
        "32d153ff 44bc2cf5ad770999 b3dd93fa 4e4f1e68 364b3fb7",
        "fb0077f9 26c7827d889f6da3 248bfa47 e2dbd2e1 9a71bb4c",
        "e85ea4de 0b242d361fda71bc 2e4ff723 347ca102 22620404",
        "7f89ba44 6ac1e58032166597 fc653843 96cb7201 c1caebe5",
        "a129ca6149be45e5",
        "acd2c40b8502cad8",
        "57cfd434 e3069283",
        "strings 32d153ff 44bc2cf5ad770999 0b885c8b",
        "fnv 4f9f2cab 4f9f2cab a430d84680aabd0b a430d84680aabd0b",
        "crc split true",
        "",
      ].join("\n"),
      source: `
import [Hash] from "std/hash.bpl";
extern printf(fmt: string, ...);
extern strlen(s: string) ret long;
frame row(data: *u8, n: long) {
    printf("%08x %016lx %08x %08x %08x\\n", Hash.xxhash32(data, n, 0), Hash.xxhash64(data, n, 0), Hash.murmur3_32(data, n, 0), Hash.murmur3_32(data, n, 42), Hash.crc32c(data, n));
}
frame main() ret int {
    local texts: string[5] = ["", "a", "abc", "hello", "The quick brown fox jumps over the lazy dog"];
    loop (local i: int = 0; i < 5; i = i + 1) { row(cast<*u8>(texts[i]), strlen(texts[i])); }
    local bytes: u8[100];
    loop (local i: int = 0; i < 100; i = i + 1) { bytes[i] = cast<u8>(i); }
    row(&bytes[0], 100);
    printf("%016lx\\n", Hash.siphash24(cast<ulong>(0x0706050403020100), cast<ulong>(0x0f0e0d0c0b0a0908), &bytes[0], 15));
    printf("%016lx\\n", Hash.siphash24(cast<ulong>(0x0706050403020100), cast<ulong>(0x0f0e0d0c0b0a0908), &bytes[0], 64));
    printf("%08x %08x\\n", Hash.xxhash32(cast<*u8>("abc"), 3, 7), Hash.crc32c(cast<*u8>("123456789"), 9));
    printf("strings %08x %016lx %08x\\n", Hash.xxhash32String("abc"), Hash.xxhash64String("abc"), Hash.djb2("abc"));
    printf("fnv %08x %08x %016lx %016lx\\n", Hash.fnv1a32("hello"), Hash.fnv1a32Bytes(cast<*u8>("hello"), 5), Hash.fnv1a64("hello"), Hash.fnv1a64Bytes(cast<*u8>("hello"), 5));
    local whole: uint = Hash.crc32c(cast<*u8>("123456789"), 9);
    local split: uint = Hash.crc32cUpdate(Hash.crc32c(cast<*u8>("1234"), 4), cast<*u8>("56789"), 5);
    printf("crc split %s\\n", (whole == split) ? "true" : "false");
    return 0;
}
`,
    },
  ]);
}, 120000);

it("manipulates bits across 32- and 64-bit widths", () => {
  expectCorrectnessSuite([
    {
      name: "bit helpers",
      validateLlvm: true,
      expectedStdout: [
        "pop 3 64 lz 32 0 63 tz 32 4 63",
        "rot 00000003 80000000 0000000000000003 8000000000000000 23456781",
        "swap 78563412 0807060504030201 rev 80000000 0000000000000001",
        "parity 1 0 pow true false 1 1024 4096",
        "high -1 0 31 63 low -1 3 63 iso 0000000000000008",
        "mask 0 ff ffffffffffffffff extract ab insert 12cd5678",
        "bits true false 0000000000000009 0000000000000001 0000000000000005",
        "sign -1 127 -128",
        "morton 0000000000000007 gray 0000000000000006 7",
        "binary 00001011 1",
        "next overflow Bits.nextPowerOfTwo64 overflow",
        "",
      ].join("\n"),
      source: `
import [Bits] from "std/bits.bpl";
extern printf(fmt: string, ...);
extern free(ptr: *void);
frame main() ret int {
    printf("pop %d %d lz %d %d %d tz %d %d %d\\n", Bits.popCount32(cast<uint>(0b10110)), Bits.popCount64(~cast<ulong>(0)), Bits.leadingZeros32(cast<uint>(0)), Bits.leadingZeros64(cast<ulong>(0x8000000000000000)), Bits.leadingZeros64(cast<ulong>(1)), Bits.trailingZeros32(cast<uint>(0)), Bits.trailingZeros32(cast<uint>(16)), Bits.trailingZeros64(cast<ulong>(0x8000000000000000)));
    printf("rot %08x %08x %016lx %016lx %08x\\n", Bits.rotateLeft32(cast<uint>(0x80000001), 1), Bits.rotateRight32(cast<uint>(1), 1), Bits.rotateLeft64(cast<ulong>(0x8000000000000001), 65), Bits.rotateRight64(cast<ulong>(1), 1), Bits.rotateLeft32(cast<uint>(0x12345678), 4));
    printf("swap %08x %016lx rev %08x %016lx\\n", Bits.byteSwap32(cast<uint>(0x12345678)), Bits.byteSwap64(cast<ulong>(0x0102030405060708)), Bits.reverseBits32(cast<uint>(1)), Bits.reverseBits64(cast<ulong>(0x8000000000000000)));
    printf("parity %d %d pow %s %s %lu %lu %lu\\n", Bits.parity32(cast<uint>(7)), Bits.parity64(cast<ulong>(3)), Bits.isPowerOfTwo64(cast<ulong>(64)) ? "true" : "false", Bits.isPowerOfTwo64(cast<ulong>(0)) ? "true" : "false", Bits.nextPowerOfTwo64(cast<ulong>(0)), Bits.nextPowerOfTwo64(cast<ulong>(1000)), Bits.nextPowerOfTwo64(cast<ulong>(4096)));
    printf("high %d %d %d %d low %d %d %d iso %016lx\\n", Bits.highestBit32(cast<uint>(0)), Bits.highestBit32(cast<uint>(1)), Bits.highestBit32(cast<uint>(0xffffffff)), Bits.highestBit64(~cast<ulong>(0)), Bits.lowestBit32(cast<uint>(0)), Bits.lowestBit64(cast<ulong>(8)), Bits.lowestBit64(cast<ulong>(0x8000000000000000)), Bits.isolateLowest64(cast<ulong>(0b11000)));
    printf("mask %lx %lx %lx extract %lx insert %lx\\n", Bits.mask64(0), Bits.mask64(8), Bits.mask64(64), Bits.extract64(cast<ulong>(0xabcd), 8, 8), Bits.insert64(cast<ulong>(0x12345678), 8, 16, cast<ulong>(0xcd56)));
    printf("bits %s %s %016lx %016lx %016lx\\n", Bits.testBit64(cast<ulong>(5), 2) ? "true" : "false", Bits.testBit64(cast<ulong>(5), 99) ? "true" : "false", Bits.setBit64(cast<ulong>(1), 3), Bits.clearBit64(cast<ulong>(9), 3), Bits.toggleBit64(cast<ulong>(4), 0));
    printf("sign %ld %ld %ld\\n", Bits.signExtend64(cast<ulong>(0xff), 8), Bits.signExtend64(cast<ulong>(0x7f), 8), Bits.signExtend64(cast<ulong>(0x80), 8));
    printf("morton %016lx gray %016lx %lu\\n", Bits.interleave(cast<uint>(3), cast<uint>(1)), Bits.toGray64(cast<ulong>(4)), Bits.fromGray64(Bits.toGray64(cast<ulong>(7))));
    local text: string = Bits.toBinary64(cast<ulong>(11), 8);
    local one: string = Bits.toBinary64(cast<ulong>(1), 0);
    printf("binary %s %s\\n", text, one);
    free(cast<*void>(text));
    free(cast<*void>(one));
    try {
        Bits.nextPowerOfTwo64(cast<ulong>(0x8000000000000001));
    } catch (message: string) {
        printf("next overflow %s\\n", message);
    }
    return 0;
}
`,
    },
  ]);
}, 120000);

it("generates reproducible streams and well-formed distributions", () => {
  expectCorrectnessSuite([
    {
      name: "random generators",
      validateLlvm: true,
      expectedStdout: [
        "splitmix e220a8397b1dcdaf 6e789e6aa1b965f4 06c45d188009454f",
        "xoshiro 15780b2e0c2ec716 6104d9866d113a7e ae17533239e499a1",
        "jump 03a5c66424702131",
        "bounds true true true true",
        "unit true true",
        "distributions true true true true true",
        "sample 4 distinct true all 6",
        "shuffle sum 45",
        "errors Rand.nextBelow requires a positive bound",
        "",
      ].join("\n"),
      source: `
import [Rand], [SplitMix64], [Xoshiro256] from "std/rand.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
    local mixer: SplitMix64 = SplitMix64.seed(cast<ulong>(0));
    local m1: ulong = mixer.next(); local m2: ulong = mixer.next(); local m3: ulong = mixer.next();
    printf("splitmix %016lx %016lx %016lx\\n", m1, m2, m3);
    local x: Xoshiro256 = Xoshiro256.seed(cast<ulong>(42));
    local x1: ulong = x.nextULong(); local x2: ulong = x.nextULong(); local x3: ulong = x.nextULong();
    printf("xoshiro %016lx %016lx %016lx\\n", x1, x2, x3);
    x.jump();
    printf("jump %016lx\\n", x.nextULong());
    local r: Rand = Rand.seed(cast<ulong>(7));
    local inBelow: bool = true; local inLong: bool = true; local inRange: bool = true; local hitAll: bool = true;
    local seen: int[5];
    loop (local i: int = 0; i < 5; i = i + 1) { seen[i] = 0; }
    loop (local i: int = 0; i < 2000; i = i + 1) {
        local b: ulong = r.nextBelow(cast<ulong>(5));
        if (b >= cast<ulong>(5)) { inBelow = false; } else { seen[cast<int>(b)] = seen[cast<int>(b)] + 1; }
        local l: long = r.rangeLong(cast<long>(-5000000000), cast<long>(5000000000));
        if ((l < cast<long>(-5000000000)) || (l >= cast<long>(5000000000))) { inLong = false; }
        local q: int = x.range(-3, 3);
        if ((q < -3) || (q >= 3)) { inRange = false; }
    }
    loop (local i: int = 0; i < 5; i = i + 1) { if (seen[i] < 300) { hitAll = false; } }
    printf("bounds %s %s %s %s\\n", inBelow ? "true" : "false", inLong ? "true" : "false", inRange ? "true" : "false", hitAll ? "true" : "false");
    local unitOk: bool = true; local floatOk: bool = true;
    loop (local i: int = 0; i < 1000; i = i + 1) {
        local u: float = r.nextUnit();
        if ((u < 0.0) || (u >= 1.0)) { unitOk = false; }
        local f: float = x.nextFloat();
        if ((f < 0.0) || (f >= 1.0)) { floatOk = false; }
    }
    printf("unit %s %s\\n", unitOk ? "true" : "false", floatOk ? "true" : "false");
    local expSum: float = 0.0; local normSum: float = 0.0; local poisSum: int = 0; local bigPois: int = 0; local trues: int = 0;
    loop (local i: int = 0; i < 4000; i = i + 1) {
        expSum = expSum + r.nextExponential(2.0);
        normSum = normSum + r.nextNormal(10.0, 2.0);
        poisSum = poisSum + r.nextPoisson(3.0);
        bigPois = bigPois + r.nextPoisson(50.0);
        if (r.nextBernoulli(0.25)) { trues = trues + 1; }
    }
    local expMean: float = expSum / 4000.0; local normMean: float = normSum / 4000.0;
    local poisMean: float = cast<float>(poisSum) / 4000.0; local bigMean: float = cast<float>(bigPois) / 4000.0;
    local binom: int = r.nextBinomial(1000, 0.5);
    printf("distributions %s %s %s %s %s\\n", ((expMean > 0.45) && (expMean < 0.55)) ? "true" : "false", ((normMean > 9.8) && (normMean < 10.2)) ? "true" : "false", ((poisMean > 2.8) && (poisMean < 3.2)) ? "true" : "false", ((bigMean > 49.0) && (bigMean < 51.0) && (trues > 900) && (trues < 1100)) ? "true" : "false", ((binom > 420) && (binom < 580)) ? "true" : "false");
    local items: Array<int> = Array<int>.new(6);
    loop (local i: int = 0; i < 6; i = i + 1) { items.push(i * 10); }
    local picked: Array<int> = r.sample<int>(&items, 4);
    local distinct: bool = true;
    loop (local i: int = 0; i < picked.length; i = i + 1) {
        loop (local j: int = i + 1; j < picked.length; j = j + 1) { if (picked.get(i) == picked.get(j)) { distinct = false; } }
    }
    local everything: Array<int> = r.sample<int>(&items, 99);
    printf("sample %d distinct %s all %d\\n", picked.length, distinct ? "true" : "false", everything.length);
    picked.destroy(); everything.destroy();
    local digits: Array<int> = Array<int>.new(10);
    loop (local i: int = 0; i < 10; i = i + 1) { digits.push(i); }
    x.shuffle<int>(&digits);
    local total: int = 0;
    loop (local i: int = 0; i < 10; i = i + 1) { total = total + digits.get(i); }
    printf("shuffle sum %d\\n", total);
    digits.destroy(); items.destroy();
    try { r.nextBelow(cast<ulong>(0)); } catch (message: string) { printf("errors %s\\n", message); }
    return 0;
}
`,
    },
  ]);
}, 120000);
