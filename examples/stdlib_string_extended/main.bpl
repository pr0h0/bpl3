# Extended String Library Test

import [String], [Array] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Extended String Library Test ===\n\n");

    # Test trim functions
    printf("--- Trim Functions ---\n");
    local s1: String = String.new("   hello world   ");
    local trimmed: String = s1.trim();
    printf("Original: '%s'\n", s1.data);
    printf("trim(): '%s'\n", trimmed.data);

    local trimLeft: String = s1.trimLeft();
    printf("trimLeft(): '%s'\n", trimLeft.data);

    local trimRight: String = s1.trimRight();
    printf("trimRight(): '%s'\n", trimRight.data);

    # Test case conversion
    printf("\n--- Case Conversion ---\n");
    local s2: String = String.new("Hello World 123");
    local upper: String = s2.toUpper();
    local lower: String = s2.toLower();
    printf("Original: '%s'\n", s2.data);
    printf("toUpper(): '%s'\n", upper.data);
    printf("toLower(): '%s'\n", lower.data);

    # Test startsWith/endsWith
    printf("\n--- Starts/Ends With ---\n");
    local s3: String = String.new("hello_world.txt");
    printf("String: '%s'\n", s3.data);
    printf("startsWith('hello'): %d\n", cast<int>(s3.startsWith("hello")));
    printf("startsWith('world'): %d\n", cast<int>(s3.startsWith("world")));
    printf("endsWith('.txt'): %d\n", cast<int>(s3.endsWith(".txt")));
    printf("endsWith('.bpl'): %d\n", cast<int>(s3.endsWith(".bpl")));

    # Test repeat
    printf("\n--- Repeat ---\n");
    local s4: String = String.new("ab");
    local repeated: String = s4.repeat(5);
    printf("'%s'.repeat(5) = '%s'\n", s4.data, repeated.data);

    # Test padding
    printf("\n--- Padding ---\n");
    local s5: String = String.new("42");
    local padLeft: String = s5.padLeft(6, '0');
    local padRight: String = s5.padRight(6, ' ');
    printf("'%s'.padLeft(6, '0') = '%s'\n", s5.data, padLeft.data);
    printf("'%s'.padRight(6, ' ') = '%s'\n", s5.data, padRight.data);

    # Test reverse
    printf("\n--- Reverse ---\n");
    local s6: String = String.new("hello");
    local reversed: String = s6.reverse();
    printf("'%s'.reverse() = '%s'\n", s6.data, reversed.data);

    # Test replace
    printf("\n--- Replace ---\n");
    local s7: String = String.new("hello world world");
    local replaced: String = s7.replace("world", "BPL");
    local replacedAll: String = s7.replaceAll("world", "BPL");
    printf("Original: '%s'\n", s7.data);
    printf("replace('world', 'BPL'): '%s'\n", replaced.data);
    printf("replaceAll('world', 'BPL'): '%s'\n", replacedAll.data);

    # Test indexOf/lastIndexOf
    printf("\n--- Index Of ---\n");
    local s8: String = String.new("abcdefabc");
    printf("String: '%s'\n", s8.data);
    printf("indexOf('abc'): %d\n", s8.indexOf("abc"));
    printf("indexOf('def'): %d\n", s8.indexOf("def"));
    printf("indexOf('xyz'): %d\n", s8.indexOf("xyz"));
    printf("lastIndexOf('abc'): %d\n", s8.lastIndexOf("abc"));

    # Test count
    printf("\n--- Count ---\n");
    local s9: String = String.new("banana");
    printf("'%s'.count('a') = %d\n", s9.data, s9.count("a"));
    printf("'%s'.count('na') = %d\n", s9.data, s9.count("na"));
    printf("'%s'.count('x') = %d\n", s9.data, s9.count("x"));

    # Test character classification
    printf("\n--- Character Classification ---\n");
    local digits: String = String.new("12345");
    local alpha: String = String.new("Hello");
    local mixed: String = String.new("Hello123");
    local special: String = String.new("Hello!");

    printf("'%s'.isDigits() = %d\n", digits.data, cast<int>(digits.isDigits()));
    printf("'%s'.isAlpha() = %d\n", alpha.data, cast<int>(alpha.isAlpha()));
    printf("'%s'.isAlphanumeric() = %d\n", mixed.data, cast<int>(mixed.isAlphanumeric()));
    printf("'%s'.isAlphanumeric() = %d\n", special.data, cast<int>(special.isAlphanumeric()));

    # Cleanup
    s1.destroy();
    trimmed.destroy();
    trimLeft.destroy();
    trimRight.destroy();
    s2.destroy();
    upper.destroy();
    lower.destroy();
    s3.destroy();
    s4.destroy();
    repeated.destroy();
    s5.destroy();
    padLeft.destroy();
    padRight.destroy();
    s6.destroy();
    reversed.destroy();
    s7.destroy();
    replaced.destroy();
    replacedAll.destroy();
    s8.destroy();
    s9.destroy();
    digits.destroy();
    alpha.destroy();
    mixed.destroy();
    special.destroy();

    printf("\n=== All String Tests Passed! ===\n");
    return 0;
}
