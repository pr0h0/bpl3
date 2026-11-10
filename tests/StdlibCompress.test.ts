import { expect, it } from "bun:test";
import zlib from "zlib";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

// Node's zlib produces dynamic-Huffman input for the BPL decoder and checks
// that the BPL encoder's output is valid gzip, zlib and raw DEFLATE.

it("interoperates with zlib for raw, zlib and gzip streams", () => {
  const text = Buffer.from(
    Array.from(
      { length: 40 },
      (_, i) =>
        `line ${i}: the quick brown fox ${i % 7} jumps over the lazy dog\n`,
    ).join(""),
  );
  const hex = (b: Buffer) => b.toString("hex");
  const gz = zlib.gzipSync(text, { level: 9 });
  const zl = zlib.deflateSync(text, { level: 6 });
  const raw = zlib.deflateRawSync(
    Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaabcabcabcabc"),
    { level: 1 },
  );
  const stored = zlib.deflateRawSync(Buffer.from("stored!"), { level: 0 });
  const crc = zlib.crc32(text).toString(16).padStart(8, "0");
  const src = `
  import [Deflate] from "std/compress.bpl";
  import [Array] from "std/array.bpl";
  import [Hash] from "std/hash.bpl";
  extern printf(fmt: string, ...);
  extern strlen(s: string) ret long;
  frame unhex(text: string) ret Array<u8> {
    local out: Array<u8> = Array<u8>.new(16);
    local n: long = strlen(text);
    loop (local i: long = 0; i < n; i = i + 2) {
      local hi: int = cast<int>(text[i]); local lo: int = cast<int>(text[i + 1]);
      if (hi >= 97) { hi = hi - 87; } else { hi = hi - 48; }
      if (lo >= 97) { lo = lo - 87; } else { lo = lo - 48; }
      out.push(cast<u8>((hi * 16) + lo));
    }
    return out;
  }
  frame dump(label: string, bytes: Array<u8>) {
    printf("%s ", label);
    loop (local i: int = 0; i < bytes.length; i = i + 1) { printf("%02x", bytes.get(i)); }
    printf("\\n");
  }
  frame main() ret int {
    local gz: Array<u8> = unhex("${hex(gz)}");
    local a: Array<u8> = Deflate.gzipDecompress(gz.data, cast<long>(gz.length));
    printf("gzip %d %08x\\n", a.length, Hash.crc32(a.data, cast<long>(a.length)));
    local zl: Array<u8> = unhex("${hex(zl)}");
    local b: Array<u8> = Deflate.zlibDecompress(zl.data, cast<long>(zl.length));
    printf("zlib %d %08x\\n", b.length, Hash.crc32(b.data, cast<long>(b.length)));
    local raw: Array<u8> = unhex("${hex(raw)}");
    local c: Array<u8> = Deflate.inflate(raw.data, cast<long>(raw.length));
    c.push(cast<u8>(0)); printf("raw %s\\n", cast<string>(c.data));
    local st: Array<u8> = unhex("${hex(stored)}");
    local d: Array<u8> = Deflate.inflate(st.data, cast<long>(st.length));
    d.push(cast<u8>(0)); printf("stored %s\\n", cast<string>(d.data));
    loop (local level: int = 0; level <= 9; level = level + 3) {
      local g: Array<u8> = Deflate.gzipCompress(a.data, cast<long>(a.length), level);
      local back: Array<u8> = Deflate.gzipDecompress(g.data, cast<long>(g.length));
      printf("level %d size %d roundtrip %d\\n", level, g.length, (back.length == a.length) && (Hash.crc32(back.data, cast<long>(back.length)) == Hash.crc32(a.data, cast<long>(a.length))));
      g.destroy(); back.destroy();
    }
    dump("gz", Deflate.gzipCompress(a.data, cast<long>(a.length), 6));
    dump("zl", Deflate.zlibCompress(a.data, cast<long>(a.length), 9));
    dump("rw", Deflate.deflate(cast<*u8>("abracadabra abracadabra abracadabra"), 35, 6));
    local bad: Array<u8> = unhex("${hex(gz)}");
    bad.data[bad.length - 6] = cast<u8>(bad.data[bad.length - 6] ^ cast<u8>(1));
    try { Deflate.gzipDecompress(bad.data, cast<long>(bad.length)); } catch (m: string) { printf("error %s\\n", m); }
    try { Deflate.inflate(raw.data, cast<long>(raw.length - 3)); } catch (m: string) { printf("error %s\\n", m); }
    local junk: u8[4] = [cast<u8>(0xff), cast<u8>(0xff), cast<u8>(0xff), cast<u8>(0xff)];
    try { Deflate.inflate(&junk[0], 4); } catch (m: string) { printf("error %s\\n", m); }
    try { Deflate.zlibDecompress(&junk[0], 4); } catch (m: string) { printf("error %s\\n", m); }
    local twice: Array<u8> = Array<u8>.new(8);
    local m1: Array<u8> = Deflate.gzipString("ab", 1);
    local m2: Array<u8> = Deflate.gzipString("cd", 6);
    loop (local i: int = 0; i < m1.length; i = i + 1) { twice.push(m1.get(i)); }
    loop (local i: int = 0; i < m2.length; i = i + 1) { twice.push(m2.get(i)); }
    local joined: Array<u8> = Deflate.gzipDecompress(twice.data, cast<long>(twice.length));
    joined.push(cast<u8>(0));
    printf("members %s\\n", cast<string>(joined.data));
    local empty: Array<u8> = Deflate.zlibCompress(cast<*u8>(""), 0, 6);
    local emptyBack: Array<u8> = Deflate.zlibDecompress(empty.data, cast<long>(empty.length));
    printf("empty %d %d\\n", empty.length, emptyBack.length);
    return 0;
  }
  `;
  for (const level of [0, 3] as const) {
    const result = runBplAtOptimization(src, level);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\n");
    const get = (prefix: string) =>
      Buffer.from(
        lines.find((l) => l.startsWith(prefix + " "))!.slice(3),
        "hex",
      );
    expect(lines.filter((l) => !/^(gz|zl|rw) /.test(l))).toEqual([
      `gzip ${text.length} ${crc}`,
      `zlib ${text.length} ${crc}`,
      "raw aaaaaaaaaaaaaaaaaaaaaaaaaaaaaabcabcabcabc",
      "stored stored!",
      `level 0 size ${text.length + 23} roundtrip 1`,
      ...[3, 6, 9].map((l) =>
        expect.stringMatching(new RegExp(`^level ${l} size \\d+ roundtrip 1$`)),
      ),
      "error Gzip: CRC-32 mismatch",
      "error Deflate: unexpected end of input",
      "error Deflate: invalid block type",
      "error Zlib: input too short",
      "members abcd",
      "empty 8 0",
    ]);
    expect(zlib.gunzipSync(get("gz")).equals(text)).toBe(true);
    expect(get("gz").length).toBeLessThan(text.length / 4);
    expect(zlib.inflateSync(get("zl")).equals(text)).toBe(true);
    expect(zlib.inflateRawSync(get("rw")).toString()).toBe(
      "abracadabra abracadabra abracadabra",
    );
  }
}, 120000);
