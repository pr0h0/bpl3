import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    printf("=== Test Zero-Valued Struct ===\n\n");

    # Create a Point with non-zero values to avoid ambiguity with nullptr
    printf("Creating Point { x: 5, y: 10 }\n");
    local p: *Point = Point { x: 5, y: 10 };

    # This should NOT trap - this is a valid struct
    printf("Accessing p.x (should be 5): %d\n", p.x);
    printf("Accessing p.y (should be 10): %d\n", p.y);

    # Now set to nullptr
    printf("\nSetting p to nullptr\n");
    p = nullptr;

    # This SHOULD trap
    printf("Accessing p.x on nullptr (should trap): %d\n", p.x);

    printf("\nShould not reach here\n");
    return 0;
}
