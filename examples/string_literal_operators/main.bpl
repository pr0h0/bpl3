# Demonstration of String operators with literal support

import [String] from "std/string.bpl";
import [printf] from "std/c.bpl";

frame main() {
    printf("=== String Literal Operator Demo ===\n\n");

    # Before: Had to use String.new() for every literal
    printf("--- Old way (verbose) ---\n");
    local s1: String = String.new("Hello");
    local s2: String = s1 + String.new(" World");
    printf("Result: '%s'\n", s2.toString());
    s2.destroy();
    s1.destroy();
    printf("\n");

    # After: Can use string literals directly
    printf("--- New way (concise) ---\n");
    local s3: String = String.new("Hello");
    local s4: String = s3 + " World"; # No String.new() needed!
    printf("Result: '%s'\n", s4.toString());
    s4.destroy();
    s3.destroy();
    printf("\n");

    # In-place concatenation with literals
    printf("--- In-place with literals ---\n");
    local builder: String = String.new("Building");
    builder << " a"; # No String.new() needed!
    builder << " sentence"; # No String.new() needed!
    builder << " easily!"; # No String.new() needed!
    printf("Result: '%s'\n", builder.toString());
    builder.destroy();
    printf("\n");

    # Complex example: Building a path
    printf("--- Building a file path ---\n");
    local path: String = String.new("/home");
    path << "/";
    path << "user";
    path << "/";
    path << "documents";
    path << "/";
    path << "file.txt";
    printf("Path: '%s'\n", path.toString());
    path.destroy();
    printf("\n");

    # Using + for expressions
    printf("--- Expression building ---\n");
    local name: String = String.new("Alice");
    local greeting: String = String.new("Hello, ") + name + "! Welcome to BPL3.";
    printf("Greeting: '%s'\n", greeting.toString());
    greeting.destroy();
    name.destroy();
    printf("\n");

    printf("=== Demo Complete ===\n");
}
