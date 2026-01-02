extern printf(fmt: string, ...);

# Test hex escape sequences in string literals
frame main() {
    # \x41 = 'A', \x42 = 'B', \x43 = 'C'
    local s1: string = "\x41\x42\x43";
    printf("Hex escapes: %s\n", s1); # Should print "ABC"

    # Mix hex with regular chars
    local s2: string = "Hello \x57orld"; # \x57 = 'W'
    printf("Mixed: %s\n", s2); # Should print "Hello World"

    # Test various codes
    printf("Newline via hex: Start\x0AEnd\n"); # \x0A = \n
    printf("Tab via hex: A\x09B\n"); # \x09 = \t
}
