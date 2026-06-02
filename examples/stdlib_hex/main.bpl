# Hex Encoding Test Example

import [Hex] from "std/std.bpl";

import [printf] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main() ret int {
    printf("=== Hex Encoding Test ===\n\n");

    # Test encoding strings
    printf("--- Encoding Tests ---\n");

    local encoded1: string = Hex.encodeString("Hello");
    printf("Encode 'Hello': %s\n", encoded1);
    free(cast<*void>(encoded1));

    local encoded2: string = Hex.encodeString("ABC");
    printf("Encode 'ABC': %s\n", encoded2);
    free(cast<*void>(encoded2));

    local encoded3: string = Hex.encodeString("123");
    printf("Encode '123': %s\n", encoded3);
    free(cast<*void>(encoded3));

    # Test uppercase encoding
    printf("\n--- Uppercase Encoding ---\n");
    local data: u8[3];
    data[0] = cast<u8>(0xDE);
    data[1] = cast<u8>(0xAD);
    data[2] = cast<u8>(0xBE);
    local upper: string = Hex.encodeUpper(&data[0], 3);
    printf("Encode 0xDEADBE uppercase: %s\n", upper);
    free(cast<*void>(upper));

    local lower: string = Hex.encode(&data[0], 3);
    printf("Encode 0xDEADBE lowercase: %s\n", lower);
    free(cast<*void>(lower));

    # Test decoding
    printf("\n--- Decoding Tests ---\n");

    local decoded1: string = Hex.decodeToString("48656c6c6f");
    printf("Decode '48656c6c6f': %s\n", decoded1);
    free(cast<*void>(decoded1));

    local decoded2: string = Hex.decodeToString("414243");
    printf("Decode '414243': %s\n", decoded2);
    free(cast<*void>(decoded2));

    # Test with 0x prefix
    local decoded3: string = Hex.decodeToString("0x414243");
    printf("Decode '0x414243': %s\n", decoded3);
    free(cast<*void>(decoded3));

    # Test byte to hex
    printf("\n--- Single Byte Conversion ---\n");
    local byteHex: string = Hex.byteToHex(cast<u8>(0xFF));
    printf("Byte 0xFF to hex: %s\n", byteHex);
    free(cast<*void>(byteHex));

    byteHex = Hex.byteToHex(cast<u8>(0x00));
    printf("Byte 0x00 to hex: %s\n", byteHex);
    free(cast<*void>(byteHex));

    byteHex = Hex.byteToHex(cast<u8>(0x42));
    printf("Byte 0x42 to hex: %s\n", byteHex);
    free(cast<*void>(byteHex));

    # Test u32 to hex
    printf("\n--- U32 Conversion ---\n");
    local u32Hex: string = Hex.u32ToHex(cast<u32>(0xDEADBEEF));
    printf("U32 0xDEADBEEF: %s\n", u32Hex);
    free(cast<*void>(u32Hex));

    u32Hex = Hex.u32ToHex(cast<u32>(255));
    printf("U32 255: %s\n", u32Hex);
    free(cast<*void>(u32Hex));

    # Test validation
    printf("\n--- Validation Tests ---\n");
    printf("Is 'deadbeef' valid: %d\n", cast<int>(Hex.isValid("deadbeef")));
    printf("Is 'DEADBEEF' valid: %d\n", cast<int>(Hex.isValid("DEADBEEF")));
    printf("Is '0xabcd' valid: %d\n", cast<int>(Hex.isValid("0xabcd")));
    printf("Is 'ghij' valid: %d\n", cast<int>(Hex.isValid("ghij")));
    printf("Is '' valid: %d\n", cast<int>(Hex.isValid("")));

    # Test length calculation
    printf("\n--- Length Calculations ---\n");
    printf("Decoded length of 'deadbeef': %d\n", Hex.decodedLength("deadbeef"));
    printf("Decoded length of '0xdeadbeef': %d\n", Hex.decodedLength("0xdeadbeef"));

    # Round-trip test
    printf("\n--- Round-trip Test ---\n");
    local original: string = "BPL";
    local encRt: string = Hex.encodeString(original);
    local decRt: string = Hex.decodeToString(encRt);
    printf("Original: %s\n", original);
    printf("Encoded:  %s\n", encRt);
    printf("Decoded:  %s\n", decRt);
    free(cast<*void>(encRt));
    free(cast<*void>(decRt));

    printf("\n=== Hex Test Complete ===\n");
    return 0;
}
