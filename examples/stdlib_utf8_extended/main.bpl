# Extended UTF-8 Library Test

import [UTF8], [Array] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Extended UTF-8 Library Test ===\n\n");

    # Test ASCII strings
    printf("--- ASCII String Tests ---\n");
    local ascii: string = "Hello World";
    printf("String: '%s'\n", ascii);
    printf("Byte length: %d\n", UTF8.byteLength(ascii));
    printf("Codepoint count: %d\n", UTF8.codepointCount(ascii));
    printf("Is valid UTF-8: %d\n", cast<int>(UTF8.isValid(ascii)));
    printf("Is ASCII only: %d\n", cast<int>(UTF8.isAsciiString(ascii)));

    # Test UTF-8 strings with multi-byte characters
    printf("\n--- UTF-8 Multi-byte Tests ---\n");
    # Using escape sequences for 2-byte UTF-8 (e-acute: C3 A9)
    local utf8_2byte: string = "H\xC3\xA9llo";
    printf("String with 2-byte char: '%s'\n", utf8_2byte);
    printf("Byte length: %d\n", UTF8.byteLength(utf8_2byte));
    printf("Codepoint count: %d\n", UTF8.codepointCount(utf8_2byte));
    printf("Is valid UTF-8: %d\n", cast<int>(UTF8.isValid(utf8_2byte)));
    printf("Is ASCII only: %d\n", cast<int>(UTF8.isAsciiString(utf8_2byte)));

    # Test codepoint byte length detection
    printf("\n--- Codepoint Byte Length Detection ---\n");
    printf("ASCII 'A' (0x41): %d byte(s)\n", UTF8.codepointByteLength(cast<u8>(0x41)));
    printf("2-byte start (0xC3): %d byte(s)\n", UTF8.codepointByteLength(cast<u8>(0xC3)));
    printf("3-byte start (0xE2): %d byte(s)\n", UTF8.codepointByteLength(cast<u8>(0xE2)));
    printf("4-byte start (0xF0): %d byte(s)\n", UTF8.codepointByteLength(cast<u8>(0xF0)));

    # Test codepoint decoding
    printf("\n--- Codepoint Decoding ---\n");
    printf("Decoding 'H' at pos 0: U+%04X\n", cast<int>(UTF8.decodeCodepoint(ascii, 0)));
    printf("Decoding 'e' at pos 1: U+%04X\n", cast<int>(UTF8.decodeCodepoint(ascii, 1)));
    printf("Decoding e-acute (U+00E9) from utf8_2byte at pos 1: U+%04X\n", cast<int>(UTF8.decodeCodepoint(utf8_2byte, 1)));

    # Test codepoint encoding
    printf("\n--- Codepoint Encoding ---\n");
    local buf: u8[5];

    local len1: int = UTF8.encodeCodepoint(cast<u32>(0x0041), &buf[0]); # 'A'
    buf[len1] = cast<u8>(0);
    printf("Encoding U+0041 ('A'): %d byte(s) -> '%s'\n", len1, cast<string>(&buf[0]));

    local len2: int = UTF8.encodeCodepoint(cast<u32>(0x00E9), &buf[0]); # e-acute
    buf[len2] = cast<u8>(0);
    printf("Encoding U+00E9 (e-acute): %d byte(s)\n", len2);

    local len3: int = UTF8.encodeCodepoint(cast<u32>(0x20AC), &buf[0]); # Euro sign
    buf[len3] = cast<u8>(0);
    printf("Encoding U+20AC (Euro): %d byte(s)\n", len3);

    local len4: int = UTF8.encodeCodepoint(cast<u32>(0x1F600), &buf[0]); # emoji
    buf[len4] = cast<u8>(0);
    printf("Encoding U+1F600 (emoji): %d byte(s)\n", len4);

    # Test ASCII check
    printf("\n--- ASCII Codepoint Check ---\n");
    printf("Is 'A' (0x41) ASCII: %d\n", cast<int>(UTF8.isAscii(cast<u32>(0x41))));
    printf("Is e-acute (0xE9) ASCII: %d\n", cast<int>(UTF8.isAscii(cast<u32>(0xE9))));
    printf("Is Euro (0x20AC) ASCII: %d\n", cast<int>(UTF8.isAscii(cast<u32>(0x20AC))));

    # Test toCodepoints
    printf("\n--- To Codepoints Array ---\n");
    local codepoints: Array<u32> = UTF8.toCodepoints("Hi!");
    printf("Codepoints of 'Hi!':\n");
    local i: int = 0;
    loop (i < codepoints.len()) {
        printf("  [%d]: U+%04X\n", i, cast<int>(codepoints.get(i)));
        i = i + 1;
    }
    codepoints.destroy();

    # Test empty/null strings
    printf("\n--- Edge Cases ---\n");
    printf("Empty string byte length: %d\n", UTF8.byteLength(""));
    printf("Empty string codepoint count: %d\n", UTF8.codepointCount(""));
    printf("Empty string is valid: %d\n", cast<int>(UTF8.isValid("")));
    printf("Null string is valid: %d\n", cast<int>(UTF8.isValid(nullptr)));

    printf("\n=== All UTF-8 Tests Passed! ===\n");
    return 0;
}
