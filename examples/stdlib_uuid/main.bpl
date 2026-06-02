# UUID Test Example

import [UUID], [Rand] from "std/std.bpl";

import [printf] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main() ret int {
    printf("=== UUID Test ===\n\n");

    # Initialize random seed
    Rand.seed(12345);

    # Generate UUIDs
    printf("--- UUID Generation ---\n");
    local uuid1: UUID = UUID.v4();
    local str1: string = uuid1.toString();
    printf("Generated UUID v4: %s\n", str1);
    printf("Version: %d\n", uuid1.version());
    printf("Variant: %d (1=RFC 4122)\n", uuid1.variant());
    free(cast<*void>(str1));

    local uuid2: UUID = UUID.v4();
    local str2: string = uuid2.toString();
    printf("Another UUID v4: %s\n", str2);
    free(cast<*void>(str2));

    # Nil UUID
    printf("\n--- Nil UUID ---\n");
    local nilUuid: UUID = UUID.nil();
    local nilStr: string = nilUuid.toString();
    printf("Nil UUID: %s\n", nilStr);
    printf("Is nil: %d\n", cast<int>(nilUuid.isNil()));
    printf("UUID1 is nil: %d\n", cast<int>(uuid1.isNil()));
    free(cast<*void>(nilStr));

    # Parse UUID from string
    printf("\n--- UUID Parsing ---\n");
    local parsed: UUID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
    local parsedStr: string = parsed.toString();
    printf("Parsed '550e8400-e29b-41d4-a716-446655440000': %s\n", parsedStr);
    printf("Version: %d\n", parsed.version());
    free(cast<*void>(parsedStr));

    # Parse compact format
    local compact: UUID = UUID.fromString("550e8400e29b41d4a716446655440000");
    local compactStr: string = compact.toString();
    printf("Parsed compact format: %s\n", compactStr);
    free(cast<*void>(compactStr));

    # Validation
    printf("\n--- UUID Validation ---\n");
    printf("Is '550e8400-e29b-41d4-a716-446655440000' valid: %d\n", cast<int>(UUID.isValid("550e8400-e29b-41d4-a716-446655440000")));
    printf("Is '550e8400e29b41d4a716446655440000' valid: %d\n", cast<int>(UUID.isValid("550e8400e29b41d4a716446655440000")));
    printf("Is 'invalid-uuid' valid: %d\n", cast<int>(UUID.isValid("invalid-uuid")));
    printf("Is '550e8400-e29b-41d4-a716' valid: %d\n", cast<int>(UUID.isValid("550e8400-e29b-41d4-a716")));

    # Comparison
    printf("\n--- UUID Comparison ---\n");
    local uuidA: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    local uuidB: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    local uuidC: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    printf("A equals C: %d\n", cast<int>(uuidA.equals(&uuidC)));
    printf("A equals B: %d\n", cast<int>(uuidA.equals(&uuidB)));
    printf("A compare B: %d\n", uuidA.compare(&uuidB));
    printf("B compare A: %d\n", uuidB.compare(&uuidA));
    printf("A compare C: %d\n", uuidA.compare(&uuidC));

    # Clone
    printf("\n--- UUID Clone ---\n");
    local original: UUID = UUID.v4();
    local cloned: UUID = original.clone();
    printf("Original equals clone: %d\n", cast<int>(original.equals(&cloned)));

    # Bytes conversion
    printf("\n--- Bytes Conversion ---\n");
    local bytesOut: u8[16];
    uuid1.toBytes(&bytesOut[0]);
    printf("First byte of UUID1: %d\n", cast<int>(bytesOut[0]));
    printf("Last byte of UUID1: %d\n", cast<int>(bytesOut[15]));

    local fromBytes: UUID = UUID.fromBytes(&bytesOut[0]);
    printf("Reconstructed equals original: %d\n", cast<int>(uuid1.equals(&fromBytes)));

    printf("\n=== UUID Test Complete ===\n");
    return 0;
}
