# Base64 Encoding Test Example

import [Base64] from "std/std.bpl";

import [printf] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main() ret int {
    printf("=== Base64 Encoding Test ===\n\n");

    # Test encoding strings
    printf("--- Encoding Tests ---\n");

    local encoded1: string = Base64.encodeString("Hello");
    printf("Encode 'Hello': %s\n", encoded1);
    free(cast<*void>(encoded1));

    local encoded2: string = Base64.encodeString("Hello, World!");
    printf("Encode 'Hello, World!': %s\n", encoded2);
    free(cast<*void>(encoded2));

    local encoded3: string = Base64.encodeString("a");
    printf("Encode 'a': %s\n", encoded3);
    free(cast<*void>(encoded3));

    local encoded4: string = Base64.encodeString("ab");
    printf("Encode 'ab': %s\n", encoded4);
    free(cast<*void>(encoded4));

    local encoded5: string = Base64.encodeString("abc");
    printf("Encode 'abc': %s\n", encoded5);
    free(cast<*void>(encoded5));

    # Test decoding
    printf("\n--- Decoding Tests ---\n");

    local decoded1: string = Base64.decodeToString("SGVsbG8=");
    printf("Decode 'SGVsbG8=': %s\n", decoded1);
    free(cast<*void>(decoded1));

    local decoded2: string = Base64.decodeToString("SGVsbG8sIFdvcmxkIQ==");
    printf("Decode 'SGVsbG8sIFdvcmxkIQ==': %s\n", decoded2);
    free(cast<*void>(decoded2));

    local decoded3: string = Base64.decodeToString("YQ==");
    printf("Decode 'YQ==': %s\n", decoded3);
    free(cast<*void>(decoded3));

    local decoded4: string = Base64.decodeToString("YWI=");
    printf("Decode 'YWI=': %s\n", decoded4);
    free(cast<*void>(decoded4));

    local decoded5: string = Base64.decodeToString("YWJj");
    printf("Decode 'YWJj': %s\n", decoded5);
    free(cast<*void>(decoded5));

    # Test validation
    printf("\n--- Validation Tests ---\n");
    printf("Is 'SGVsbG8=' valid: %d\n", cast<int>(Base64.isValid("SGVsbG8=")));
    printf("Is 'SGVsbG8' valid: %d\n", cast<int>(Base64.isValid("SGVsbG8")));
    printf("Is 'Invalid!!!' valid: %d\n", cast<int>(Base64.isValid("Invalid!!!")));
    printf("Is 'YWJj' valid: %d\n", cast<int>(Base64.isValid("YWJj")));

    # Test length calculations
    printf("\n--- Length Calculations ---\n");
    printf("Encoded length for 3 bytes: %d\n", Base64.encodedLength(3));
    printf("Encoded length for 4 bytes: %d\n", Base64.encodedLength(4));
    printf("Encoded length for 10 bytes: %d\n", Base64.encodedLength(10));
    printf("Decoded length of 'SGVsbG8=': %d\n", Base64.decodedLength("SGVsbG8="));

    # Round-trip test
    printf("\n--- Round-trip Test ---\n");
    local original: string = "BPL is awesome!";
    local encRt: string = Base64.encodeString(original);
    local decRt: string = Base64.decodeToString(encRt);
    printf("Original: %s\n", original);
    printf("Encoded:  %s\n", encRt);
    printf("Decoded:  %s\n", decRt);
    free(cast<*void>(encRt));
    free(cast<*void>(decRt));

    printf("\n=== Base64 Test Complete ===\n");
    return 0;
}
