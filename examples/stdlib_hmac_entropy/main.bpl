import printf, free, malloc, memset from "std/c.bpl";
import [Hmac] from "std/hmac.bpl";
import [Entropy] from "std/entropy.bpl";

frame printMac(label: string, raw: *u8) {
    printf("%s ", label);
    local i: int = 0;
    loop (i < 32) {
        printf("%02x", cast<int>(*(raw + i)));
        i = i + 1;
    }
    printf("\n");
}

# RFC 4231 test case with a key of `keyLength` copies of `keyByte`.
frame repeatedKeyCase(label: string, keyByte: int, keyLength: int, data: *u8, dataLength: long) {
    local key: *u8 = cast<*u8>(malloc(cast<long>(keyLength)));
    memset(cast<*void>(key), keyByte, cast<long>(keyLength));
    local mac: u8[32];
    Hmac.digest(key, cast<long>(keyLength), data, dataLength, &mac[0]);
    printMac(label, &mac[0]);
    free(cast<*void>(key));
}

frame main() ret int {
    repeatedKeyCase("case1", 0x0b, 20, cast<*u8>("Hi There"), 8);

    local jefe: string = Hmac.hex("Jefe", "what do ya want for nothing?");
    printf("case2 %s\n", jefe);
    free(cast<*void>(jefe));

    local dd: u8[50];
    memset(cast<*void>(&dd[0]), 0xdd, 50);
    repeatedKeyCase("case3", 0xaa, 20, &dd[0], 50);

    # Keys longer than the 64-byte block are hashed first.
    local longKeyData: string = "Test Using Larger Than Block-Size Key - Hash Key First";
    repeatedKeyCase("case6", 0xaa, 131, cast<*u8>(longKeyData), 54);
    local longData: string = "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.";
    repeatedKeyCase("case7", 0xaa, 131, cast<*u8>(longData), 152);

    # Streaming in pieces gives the same MAC as one call.
    local streamed: Hmac = Hmac.sha256(cast<*u8>("Jefe"), 4);
    streamed.update(cast<*u8>("what do ya "), 11);
    streamed.update(cast<*u8>("want for nothing?"), 17);
    local streamedMac: u8[32];
    streamed.finish(&streamedMac[0]);
    printMac("streamed", &streamedMac[0]);

    local same: u8[32];
    Hmac.digest(cast<*u8>("Jefe"), 4, cast<*u8>("what do ya want for nothing?"), 28, &same[0]);
    printf("equal %d\n", cast<int>(Hmac.equal(&streamedMac[0], &same[0], 32)));
    same[31] = same[31] ^ cast<u8>(1);
    printf("tampered %d\n", cast<int>(Hmac.equal(&streamedMac[0], &same[0], 32)));

    # 300 bytes take more than one getentropy call (256 bytes at most).
    local random: u8[300];
    memset(cast<*void>(&random[0]), 0, 300);
    local filled: bool = Entropy.fill(&random[0], 300);
    local nonzero: int = 0;
    loop (local i: int = 0; i < 300; i = i + 1) {
        if (random[i] != cast<u8>(0)) {
            nonzero = nonzero + 1;
        }
    }
    printf("entropy filled %d, mostly nonzero %d\n", cast<int>(filled), cast<int>(nonzero > 250));

    local inRange: bool = true;
    loop (local draw: int = 0; draw < 1000; draw = draw + 1) {
        if (Entropy.below(6) >= cast<ulong>(6)) {
            inRange = false;
        }
    }
    printf("below in range %d, below(1) %d\n", cast<int>(inRange), cast<int>(Entropy.below(1)));
    # Hex tokens: two characters per byte, only hex digits, never repeated.
    local first: string = Entropy.hexToken(16);
    local second: string = Entropy.hexToken(16);
    local hexOnly: bool = true;
    local length: int = 0;
    loop (first[length] != cast<char>(0)) {
        local c: char = first[length];
        if (!(((c >= '0') && (c <= '9')) || ((c >= 'a') && (c <= 'f')))) {
            hexOnly = false;
        }
        length = length + 1;
    }
    local differ: bool = false;
    loop (local i: int = 0; i < 32; i = i + 1) {
        if (first[i] != second[i]) {
            differ = true;
        }
    }
    printf("token length %d hex %d differ %d\n", length, cast<int>(hexOnly), cast<int>(differ));
    free(cast<*void>(first));
    free(cast<*void>(second));
    local rejected: bool = false;
    try {
        local never: string = Entropy.hexToken(0);
        free(cast<*void>(never));
    } catch {
        rejected = true;
    }
    printf("rejects 0 bytes %d\n", cast<int>(rejected));
    return 0;
}
