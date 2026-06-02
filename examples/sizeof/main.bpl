import [printf] from "std/c.bpl";
struct Point {
    x: int,
    y: int,
}
frame main() ret int {
    printf("Sizeof int: %d\n", sizeof<int>());
    printf("Sizeof Point: %d\n", sizeof<Point>());
    return 0;
}
