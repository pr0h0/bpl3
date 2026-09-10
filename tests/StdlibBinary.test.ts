import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("reads and writes exact endian byte layouts, including unaligned and full-width values", () => {
  const cases = [
    { bits: 8, endian: "", value: 0xabn },
    ...[16, 32, 64].flatMap((bits) =>
      ["LE", "BE"].map((endian) => ({
        bits,
        endian,
        value: BigInt.asUintN(bits, 0xfedcba9876543210n),
      })),
    ),
  ];
  const expected = cases.flatMap(({ bits, endian, value }) => {
    const bytes = Array.from({ length: bits / 8 }, (_, i) =>
      Number((value >> BigInt(i * 8)) & 255n),
    );
    return endian === "BE" ? bytes.reverse() : bytes;
  });
  expectCorrectnessSuite([
    {
      name: "binary endian layout",
      validateLlvm: true,
      expectedStdout: `${expected.join(" ")} \nbinary ok\n`,
      source: `
      import [ByteReader], [ByteWriter] from "std/binary.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local bytes: u8[64];
        bytes[0] = cast<u8>(77); bytes[${expected.length + 1}] = cast<u8>(88);
        local writer: ByteWriter = ByteWriter.new(&bytes[1], ${expected.length});
        ${cases
          .map(
            ({ bits, endian, value }) => `
          if (!writer.writeU${bits}${endian}(cast<u${bits}>(0x${value.toString(16)}))) { return 1; }
        `,
          )
          .join("\n")}
        if (writer.remaining() != 0 || writer.position() != ${expected.length}) { return 2; }
        if (writer.writeU8(cast<u8>(0))) { return 3; }
        if (bytes[0] != cast<u8>(77) || bytes[${expected.length + 1}] != cast<u8>(88)) { return 4; }
        loop (local i: int = 1; i <= ${expected.length}; i = i + 1) {
          printf("%d ", cast<int>(bytes[i]));
        }
        printf("\\n");
        local reader: ByteReader = ByteReader.new(&bytes[1], ${expected.length});
        ${cases
          .map(
            ({ bits, endian, value }) => `
          if (reader.readU${bits}${endian}().unwrap() != cast<u${bits}>(0x${value.toString(16)})) { return 5; }
        `,
          )
          .join("\n")}
        if (reader.readU8().isSome() || reader.remaining() != 0) { return 6; }
        printf("binary ok\\n"); return 0;
      }
    `,
    },
  ]);
}, 60000);

it("keeps cursor and destination unchanged on invalid widths, truncation, overflow, and seeks", () => {
  expectCorrectnessSuite([
    {
      name: "binary checked boundaries",
      validateLlvm: true,
      expectedStdout: "bounds ok\n",
      source: `
      import [ByteReader], [ByteWriter] from "std/binary.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local bytes: u8[4] = [cast<u8>(17), cast<u8>(34), cast<u8>(51), cast<u8>(68)];
        local w: ByteWriter = ByteWriter.new(&bytes[0], 4);
        if (w.writeUnsigned(cast<u64>(256), 1, true)) { return 1; }
        if (w.writeUnsigned(cast<u64>(1), 0, true)) { return 2; }
        if (w.writeUnsigned(cast<u64>(1), 9, true)) { return 3; }
        if (w.writeUnsigned(cast<u64>(1), -1, true)) { return 4; }
        if (w.seek(-1) || w.skip(2147483647) || w.skip(-1)) { return 5; }
        if (w.position() != 0 || !w.skip(1)) { return 6; }
        if (w.writeU32BE(cast<u32>(0))) { return 7; }
        if (w.position() != 1 || bytes[0] != cast<u8>(17) || bytes[1] != cast<u8>(34) || bytes[2] != cast<u8>(51) || bytes[3] != cast<u8>(68)) { return 8; }
        if (!w.writeUnsigned(cast<u64>(0xaabbcc), 3, false)) { return 9; }
        if (!w.seek(4) || w.seek(5) || w.remaining() != 0) { return 10; }
        local r: ByteReader = ByteReader.new(&bytes[0], 4);
        if (r.readUnsigned(0, true).isSome() || r.readUnsigned(9, true).isSome()) { return 11; }
        if (r.readUnsigned(-1, true).isSome() || r.skip(-1) || r.seek(5) || r.skip(2147483647)) { return 12; }
        if (r.position() != 0 || !r.seek(2)) { return 13; }
        if (r.readU32LE().isSome() || r.position() != 2) { return 14; }
        if (!r.seek(1) || r.readUnsigned(3, false).unwrap() != cast<u64>(0xaabbcc)) { return 15; }
        if (r.readU8().isSome() || !r.seek(4) || r.remaining() != 0) { return 16; }
        local n: ByteReader = ByteReader.new(nullptr, 8);
        local z: ByteWriter = ByteWriter.new(&bytes[0], -1);
        if (n.readU8().isSome() || z.writeU8(cast<u8>(0))) { return 17; }
        if (n.remaining() != 0 || z.remaining() != 0) { return 18; }
        printf("bounds ok\\n"); return 0;
      }
    `,
    },
  ]);
}, 60000);
