extern printf(fmt: string, ...);
extern strlen(s: string) ret int;
extern strcmp(s1: string, s2: string) ret int;
frame testStringLiterals() {
    printf("=== Testing String Literals ===\n");
    local str1: string = "Hello, World!";
    printf("String 1: %s\n", str1);
    local str2: string = "BPL Compiler";
    printf("String 2: %s\n", str2);
    # Empty string
    local empty: string = "";
    printf("Empty string: '%s'\n", empty);
    # String with special characters
    local special: string = "Line1\nLine2\tTabbed";
    printf("Special chars:\n%s\n", special);
}
frame testCharOperations() {
    printf("\n=== Testing Char Operations ===\n");
    # Character literals
    local ch1: char = cast<char>(65); # 'A'
    local ch2: char = cast<char>(66); # 'B'
    local ch3: char = cast<char>(97); # 'a'
    printf("ch1 (ASCII 65): %c\n", ch1);
    printf("ch2 (ASCII 66): %c\n", ch2);
    printf("ch3 (ASCII 97): %c\n", ch3);
    # Char arithmetic
    local next: char = cast<char>(cast<int>(ch1) + 1);
    printf("ch1 + 1: %c\n", next);
    # Char comparison
    if (ch1 < ch2) {
        printf("'A' < 'B': true\n");
    }
    if (ch1 != ch3) {
        printf("'A' != 'a': true\n");
    }
}
frame testStringLength() {
    printf("\n=== Testing String Length ===\n");
    local s1: string = "Hello";
    local len1: int = strlen(s1);
    printf("Length of '%s': %d\n", s1, len1);
    local s2: string = "This is a longer string";
    local len2: int = strlen(s2);
    printf("Length of '%s': %d\n", s2, len2);
    local s3: string = "";
    local len3: int = strlen(s3);
    printf("Length of empty string: %d\n", len3);
}
frame testStringComparison() {
    printf("\n=== Testing String Comparison ===\n");
    local str1: string = "apple";
    local str2: string = "banana";
    local str3: string = "apple";
    local cmp1: int = strcmp(str1, str2);
    printf("strcmp('%s', '%s'): %d (negative means str1 < str2)\n", str1, str2, cmp1);
    local cmp2: int = strcmp(str1, str3);
    printf("strcmp('%s', '%s'): %d (zero means equal)\n", str1, str3, cmp2);
    local cmp3: int = strcmp(str2, str1);
    printf("strcmp('%s', '%s'): %d (positive means str1 > str2)\n", str2, str1, cmp3);
}
frame testCharArray() {
    printf("\n=== Testing Char Array ===\n");
    # Build string from char array
    local chars: char[10];
    chars[0] = cast<char>(72); # H
    chars[1] = cast<char>(101); # e
    chars[2] = cast<char>(108); # l
    chars[3] = cast<char>(108); # l
    chars[4] = cast<char>(111); # o
    chars[5] = cast<char>(0); # null terminator
    printf("Char array as string: %s\n", cast<string>(&chars[0]));
    # Print individual characters
    printf("Individual chars: ");
    local i: int = 0;
    loop (i < 5) {
        printf("%c", chars[i]);
        ++i;
    }
    printf("\n");
}
frame testStringInLoop() {
    printf("\n=== Testing Strings in Loop ===\n");
    local strings: string[5];
    strings[0] = "First";
    strings[1] = "Second";
    strings[2] = "Third";
    strings[3] = "Fourth";
    strings[4] = "Fifth";
    local i: int = 0;
    loop (i < 5) {
        printf("%d: %s\n", i, strings[i]);
        ++i;
    }
}
frame printChar(c: char) {
    printf("Character: %c (ASCII: %d)\n", c, c);
}
frame testCharParameter() {
    printf("\n=== Testing Char as Parameter ===\n");
    local ch: char = cast<char>(88); # 'X'
    printChar(ch);
    local ch2: char = cast<char>(89); # 'Y'
    printChar(ch2);
}
frame testEscapeSequences() {
    printf("\n=== Testing Escape Sequences ===\n");
    printf("Newline test:\nThis is on a new line\n");
    printf("Tab test:\tThis is tabbed\n");
    printf("Quote test: \"Hello\"\n");
    printf("Backslash test: C:\\Users\\Test\n");
}
frame testStringPointers() {
    printf("\n=== Testing String Pointers ===\n");
    local str: string = "Hello, BPL!";
    local ptr: *char = cast<*char>(str);
    printf("Original string: %s\n", str);
    printf("First character via pointer: %c\n", *ptr);
    # Access characters via pointer arithmetic
    printf("First 5 characters: ");
    local i: int = 0;
    loop (i < 5) {
        printf("%c", ptr[i]);
        ++i;
    }
    printf("\n");
}
frame main() ret int {
    printf("String and Character Operations Test\n\n");
    testStringLiterals();
    testCharOperations();
    testStringLength();
    testStringComparison();
    testCharArray();
    testStringInLoop();
    testCharParameter();
    testEscapeSequences();
    testStringPointers();
    printf("\nAll string tests completed!\n");
    return 0;
}
