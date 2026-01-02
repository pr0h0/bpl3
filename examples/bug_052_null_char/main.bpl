extern printf(fmt: string, ...);
extern strlen(s: string) ret int;

# Test null char in string literal
frame main() {
    local s: string = "Hello\0World";
    printf("String: %s.\n", s); # Should print "Hello" because \0 terminates
    printf("Length via strlen: %d\n", strlen(s)); # Should be 5

    # Access char after null
    local ptr: *char = cast<*char>(s);
    printf("Char at [0]: %c (%d)\n", ptr[0], cast<int>(ptr[0]));
    printf("Char at [5]: %c (%d)\n", ptr[5], cast<int>(ptr[5])); # Should be 0
    printf("Char at [6]: %c (%d)\n", ptr[6], cast<int>(ptr[6])); # Should be 'W'
}
