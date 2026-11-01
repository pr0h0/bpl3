import [Hash] from "std";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("fnv1a32 hello: %u\n", Hash.fnv1a32("hello"));
    printf("checksum abc: %u\n", Hash.checksum32("abc"));
    printf("fnv1a64 hello: %llu\n", Hash.fnv1a64("hello"));
    printf("fnv1a64 empty: %llu\n", Hash.fnv1a64(""));

    local fox: string = "The quick brown fox jumps over the lazy dog";
    printf("crc32 check: %08x\n", Hash.crc32String("123456789"));
    printf("crc32 fox: %08x\n", Hash.crc32String(fox));
    printf("crc32 empty: %08x\n", Hash.crc32(nullptr, 0));
    # Continuing a CRC over the rest of the data matches the whole-input CRC.
    local partial: uint = Hash.crc32(cast<*u8>(fox), 10);
    printf("crc32 streamed: %08x\n", Hash.crc32Update(partial, cast<*u8>(fox) + 10, 33));

    printf("adler32 wikipedia: %08x\n", Hash.adler32(cast<*u8>("Wikipedia"), 9));
    printf("adler32 empty: %08x\n", Hash.adler32(nullptr, 0));
    return 0;
}
