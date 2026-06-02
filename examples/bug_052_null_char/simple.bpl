import [printf] from "std/c.bpl";

# Simple test without stdlib
frame main() {
    local s: string = "Hello\0World";
    printf("Test: %s\n", s);
}
