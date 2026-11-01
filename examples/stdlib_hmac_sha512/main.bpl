import printf, free, malloc, memset from "std/c.bpl";
import [Hmac], [HmacSha512] from "std/hmac.bpl";

frame printMac(label: string, raw: *u8) {
    printf("%s ", label);
    local i: int = 0;
    loop (i < 64) {
        printf("%02x", cast<int>(*(raw + i)));
        i = i + 1;
    }
    printf("\n");
}

# RFC 4231 test case with a key of `keyLength` copies of `keyByte`.
frame repeatedKeyCase(label: string, keyByte: int, keyLength: int, data: *u8, dataLength: long) {
    local key: *u8 = cast<*u8>(malloc(cast<long>(keyLength)));
    memset(cast<*void>(key), keyByte, cast<long>(keyLength));
    local mac: u8[64];
    HmacSha512.digest(key, cast<long>(keyLength), data, dataLength, &mac[0]);
    printMac(label, &mac[0]);
    free(cast<*void>(key));
}

frame main() ret int {
    repeatedKeyCase("case1", 0x0b, 20, cast<*u8>("Hi There"), 8);

    local jefe: string = HmacSha512.hex("Jefe", "what do ya want for nothing?");
    printf("case2 %s\n", jefe);
    free(cast<*void>(jefe));

    local dd: u8[50];
    memset(cast<*void>(&dd[0]), 0xdd, 50);
    repeatedKeyCase("case3", 0xaa, 20, &dd[0], 50);

    # Keys longer than the 128-byte block are hashed first.
    local longKeyData: string = "Test Using Larger Than Block-Size Key - Hash Key First";
    repeatedKeyCase("case6", 0xaa, 131, cast<*u8>(longKeyData), 54);
    local longData: string = "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.";
    repeatedKeyCase("case7", 0xaa, 131, cast<*u8>(longData), 152);

    # Streaming in pieces matches the one-shot MAC.
    local message: string = "what do ya want for nothing?";
    local context: HmacSha512 = HmacSha512.new(cast<*u8>("Jefe"), 4);
    context.update(cast<*u8>(message), 9);
    context.update(cast<*u8>(message) + 9, 19);
    local streamed: u8[64];
    context.finish(&streamed[0]);
    local oneShot: u8[64];
    HmacSha512.digest(cast<*u8>("Jefe"), 4, cast<*u8>(message), 28, &oneShot[0]);
    printf("streamed equal: %d\n", Hmac.equal(&streamed[0], &oneShot[0], 64));
    oneShot[63] = oneShot[63] ^ cast<u8>(1);
    printf("tampered equal: %d\n", Hmac.equal(&streamed[0], &oneShot[0], 64));
    return 0;
}
