import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("edits UTF-8 by codepoint, converts UTF-16 and calibrates benchmarks", () => {
  expectCorrectnessSuite([
    {
      name: "utf8 and bench",
      validateLlvm: true,
      expectedStdout:
        "reverse [\ud83d\ude00 \u672c\u65e5 dlr\u00f6w oll\u00e9h] 25\nsubstring [w\u00f6rld] 6\ntail [\u65e5\u672c \ud83d\ude00] 11\ntruncate [h\u00e9ll] 5\nsanitize [ok\ufffdend\ufffd] 11\noffsets 0 3 -1 25\nutf16 4 0061 d83d de00 00e9\nfromUtf16 [a\ud83d\ude00\u00e9] 7\nunpaired [a\ud83d\ude00\u00e9\ufffd] 10\nwidth 19 1 4 ws T T F\nfromCodepoints [A\ud83d\ude00\ufffd] 8\nbench T T 10 T\n",
      source: `import [UTF8] from "std/utf8.bpl";
import [Bench], [BenchResult] from "std/bench.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);
frame show(label: string, s: String) { printf("%s [%s] %d\\n", label, s.cstr(), s.length); local c: String = s; c.destroy(); }
frame main() ret int {
    local text: string = "héllo wörld 日本 😀";
    show("reverse", UTF8.reverse(text));
    show("substring", UTF8.substring(text, 6, 5));
    show("tail", UTF8.substring(text, 12, 100));
    show("truncate", UTF8.truncate(text, 4));
    show("sanitize", UTF8.sanitize("ok\\xFFend\\xC3"));
    printf("offsets %d %d %d %d\\n", UTF8.byteOffset(text, 0), UTF8.byteOffset(text, 2), UTF8.byteOffset(text, 17), UTF8.byteOffset(text, 16));
    local units: Array<u16> = UTF8.toUtf16("a😀é");
    printf("utf16 %d %04x %04x %04x %04x\\n", units.length, units.get(0), units.get(1), units.get(2), units.get(3));
    show("fromUtf16", UTF8.fromUtf16(&units));
    units.push(cast<u16>(0xD800));
    show("unpaired", UTF8.fromUtf16(&units));
    units.destroy();
    printf("width %d %d %d ws %s %s %s\\n", UTF8.displayWidth(text), UTF8.displayWidth("é"), UTF8.displayWidth("ＡＢ"), UTF8.isWhitespace(cast<u32>(0x3000)) ? "T" : "F", UTF8.isWhitespace(cast<u32>(0x2007)) ? "T" : "F", UTF8.isWhitespace(cast<u32>(65)) ? "T" : "F");
    local cps: Array<u32> = Array<u32>.new(3);
    cps.push(cast<u32>(0x41)); cps.push(cast<u32>(0x1F600)); cps.push(cast<u32>(0xD800));
    show("fromCodepoints", UTF8.fromCodepoints(&cps));
    cps.destroy();
    local counter: long = 0;
    local counterPtr: *long = &counter;
    local result: BenchResult = Bench.measureFor(cast<long>(5), || {
        *counterPtr = *counterPtr + 1;
        Bench.consume(*counterPtr);
    });
    local fixed: BenchResult = Bench.runFixed(cast<long>(10), || { Bench.consume(cast<long>(1)); });
    printf("bench %s %s %ld %s\\n", (result.iterations >= cast<long>(1)) ? "T" : "F", (counter >= result.iterations) ? "T" : "F", fixed.iterations, (result.opsPerSecond() > 0.0) ? "T" : "F");
    return 0;
}
`,
    },
  ]);
}, 120000);
