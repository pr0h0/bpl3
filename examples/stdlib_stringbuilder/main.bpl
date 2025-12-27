# StringBuilder demonstration

extern printf(fmt: string, ...) ret int;

import [StringBuilder] from "std/string_builder.bpl";
import [String] from "std/string.bpl";

frame main() ret int {
    printf("=== StringBuilder Tests ===\n\n");

    # Test basic append
    printf("--- Basic String Building ---\n");
    local sb1: StringBuilder = StringBuilder.newDefault();
    sb1.append("Hello");
    sb1.append(", ");
    sb1.append("World");
    sb1.append("!");
    printf("Result: '%s'\n", sb1.toString());
    printf("Length: %d\n", sb1.len());
    sb1.destroy();
    printf("\n");

    # Test << operator
    printf("--- Using << Operator ---\n");
    local sb2: StringBuilder = StringBuilder.newDefault();
    sb2 << "The " << "quick " << "brown " << "fox";
    printf("Result: '%s'\n", sb2.toString());
    printf("Length: %d\n", sb2.len());
    sb2.destroy();
    printf("\n");

    # Test appendInt
    printf("--- Appending Integers ---\n");
    local sb3: StringBuilder = StringBuilder.newDefault();
    sb3.append("Numbers: ");
    sb3.appendInt(42);
    sb3.append(", ");
    sb3.appendInt(-100);
    sb3.append(", ");
    sb3.appendInt(0);
    printf("Result: '%s'\n", sb3.toString());
    sb3.destroy();
    printf("\n");

    # Test appendChar
    printf("--- Appending Characters ---\n");
    local sb4: StringBuilder = StringBuilder.newDefault();
    sb4.appendChar(cast<char>(65)); # 'A'
    sb4.appendChar(cast<char>(66)); # 'B'
    sb4.appendChar(cast<char>(67)); # 'C'
    printf("Result: '%s'\n", sb4.toString());
    sb4.destroy();
    printf("\n");

    # Test clear and reuse
    printf("--- Clear and Reuse ---\n");
    local sb5: StringBuilder = StringBuilder.newDefault();
    sb5.append("First");
    printf("Before clear: '%s'\n", sb5.toString());
    sb5.clear();
    sb5.append("Second");
    printf("After clear: '%s'\n", sb5.toString());
    sb5.destroy();
    printf("\n");

    # Test capacity growth
    printf("--- Capacity Growth ---\n");
    local sb6: StringBuilder = StringBuilder.new(10);
    printf("Initial capacity: %d\n", sb6.capacity);
    sb6.append("This is a very long string that will exceed the initial capacity");
    printf("After long append:\n");
    printf("  Result: '%s'\n", sb6.toString());
    printf("  Length: %d\n", sb6.len());
    printf("  Capacity: %d\n", sb6.capacity);
    sb6.destroy();
    printf("\n");

    # Test building loop
    printf("--- Building in Loop ---\n");
    local sb7: StringBuilder = StringBuilder.newDefault();
    sb7.append("Counting: ");
    local i: int = 1;
    loop (i <= 5) {
        sb7.appendInt(i);
        if (i < 5) {
            sb7.append(", ");
        }
        i = i + 1;
    }
    printf("Result: '%s'\n", sb7.toString());
    sb7.destroy();
    printf("\n");

    # Test toString
    printf("--- Convert to String ---\n");
    local sb8: StringBuilder = StringBuilder.newDefault();
    sb8 << "Convert " << "to " << "String";
    local str: String = String.new(sb8.toString());
    printf("StringBuilder: '%s'\n", sb8.toString());
    printf("String object: '%s'\n", str.toString());
    printf("String length: %d\n", str.length);
    sb8.destroy();
    str.destroy();
    printf("\n");

    printf("=== All StringBuilder Tests Complete ===\n");
    return 0;
}
