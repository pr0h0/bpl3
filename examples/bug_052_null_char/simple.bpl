extern printf(fmt: string, ...);

# Simple test without stdlib
frame main() {
    local s: string = "Hello\0World";
    printf("Test: %s\n", s);
}
