import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

struct Rectangle {
    topLeft: Point,
    bottomRight: Point,
}

# Test passing nullptr as parameter
frame processPoint(p: *Point) ret int {
    return p.x + p.y; # Should trap if p is nullptr
}

# Test returning nullptr
frame createNullPoint() ret *Point {
    local p: *Point = nullptr;
    return p; # Returning nullptr object
}

# Test nullptr in function call chain
frame getX(p: *Point) ret int {
    return p.x;
}

frame doubleX(p: *Point) ret int {
    local x: int = getX(p);
    return x * 2;
}

# Test nullptr with pass-by-value semantics
frame modifyPoint(p: *Point) {
    p.x = 100; # Should trap if p is nullptr
    p.y = 200;
}

# Test struct containing struct
frame processRectangle(r: *Rectangle) ret int {
    return r.topLeft.x; # Should work if r is not nullptr, trap on r.topLeft if r is nullptr
}

frame main() ret int {
    printf("=== Nullptr Function Parameters Test ===\n\n");

    # Test 1: Pass nullptr directly
    printf("Test 1: Passing nullptr as parameter\n");
    local p: *Point = nullptr;
    local _result: int = processPoint(p); # Should trap inside processPoint

    printf("Should not reach here\n");
    return 0;
}
