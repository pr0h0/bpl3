import [ByteReader], [ByteWriter] from "std/binary.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    local packet: u8[6];
    local writer: ByteWriter = ByteWriter.new(&packet[0], 6);
    if (!writer.writeU16BE(cast<u16>(0xcafe)) || !writer.writeU32LE(cast<u32>(123456))) {
        return 1;
    }
    local reader: ByteReader = ByteReader.new(&packet[0], writer.position());
    local magic: u16 = reader.readU16BE().unwrap();
    local value: u32 = reader.readU32LE().unwrap();
    printf("magic=%x value=%u remaining=%d\n", cast<uint>(magic), value, reader.remaining());
    printf("truncated=%d\n", reader.readU8().isNone());
    return 0;
}
