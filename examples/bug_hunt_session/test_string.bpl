# Bug Hunt: String Edge Cases
import [printf] from "std/c.bpl";

frame main() {
    # Test 1: Empty string
    local empty: string = "";
    printf("Empty string: '%s'\n", empty);

    # Test 2: String with escape sequences
    local escaped: string = "Tab:\tNewline:\nBackslash:\\";
    printf("Escaped: %s\n", escaped);

    # Test 3: String with null byte (embedded null)
    local withNull: string = "Hello\0World";
    printf("With null: '%s'\n", withNull); # Should print only "Hello"

    # Test 4: Very long string
    local longStr: string = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    printf("Long string: %s\n", longStr);

    # Test 5: Unicode characters (BUG: causes LLVM error)
    # local unicode: string = "Hello 世界";
    # printf("Unicode: %s\n", unicode);
    printf("Skipping unicode test - causes LLVM error\n");

    # Test 6: String comparison
    local s1: string = "hello";
    local s2: string = "hello";
    local s3: string = "world";

    # String equality - does it work?
    if (s1 == s2) {
        printf("s1 == s2: true\n");
    } else {
        printf("s1 == s2: false\n");
    }

    if (s1 == s3) {
        printf("s1 == s3: true\n");
    } else {
        printf("s1 == s3: false\n");
    }

    # Test 7: String indexing
    local c: char = s1[0];
    printf("First char of 'hello': %c\n", c);

    # Test 8: String as format specifier (potential format string vulnerability)
    local fmt: string = "%s %d\n";
    printf(fmt, "test", 42);
}
