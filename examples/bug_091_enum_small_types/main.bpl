extern printf(fmt: string, ...) ret int;
extern malloc(size: u64) ret *void;
extern memcpy(dest: *void, src: *void, n: u64) ret *void;

enum Packet {
    Header(u8, u8, u8),
    Data(u8),
    Footer,
}

frame main() {
    # Test u8 fields - constructor should not overflow
    # When we create Packet.Header(255, 128, 64), if the compiler stores
    # these as i32 values instead of u8, it will corrupt adjacent memory

    local header: Packet = Packet.Header(255, 128, 64);

    # Create a pointer to inspect the raw bytes
    local ptr: *Packet = malloc(sizeof<Packet>());
    memcpy(cast<*void>(ptr), cast<*void>(&header), sizeof<Packet>());

    # Cast to byte pointer to inspect individual bytes
    local bytes: *u8 = cast<*u8>(ptr);

    # Skip the tag (first 4 bytes, i32)
    # Then we should see: 255, 128, 64 as u8 values
    local byte4: u8 = bytes[4];
    local byte5: u8 = bytes[5];
    local byte6: u8 = bytes[6];

    printf("Bytes at offset 4, 5, 6: %d %d %d\n", cast<int>(byte4), cast<int>(byte5), cast<int>(byte6));

    if ((byte4 == 255) && (byte5 == 128) && (byte6 == 64)) {
        printf("SUCCESS\n");
    } else {
        printf("FAIL: Expected 255 128 64, got %d %d %d\n", cast<int>(byte4), cast<int>(byte5), cast<int>(byte6));
    }
}
