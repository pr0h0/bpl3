extern printf(fmt: string, ...) ret int;
extern malloc(size: u64) ret *void;
extern memset(ptr: *void, value: int, num: u64) ret *void;

struct Point {
    x: int,
    y: int,
}

struct Large {
    a: int,
    b: int,
    c: int,
    d: int,
    e: int,
}

struct Mixed {
    flag: bool,
    value: int,
    data: u8,
}

enum Shape {
    Circle(int),
    Rectangle(Point),
    Triangle(Point, Point, Point),
    Box(Large),
    Complex(Mixed, Point, int),
}

frame testEnum(s: Shape, testName: string) ret bool {
    # Allocate buffer and fill with sentinel value (0xAA)
    local size: u64 = sizeof<Shape>() + 16;
    local buffer: *u8 = cast<*u8>(malloc(size));
    memset(cast<*void>(buffer), 170, size); # 0xAA = 170

    # Copy the enum to the buffer
    local i: u64 = 0;
    local src: *u8 = cast<*u8>(&s);
    loop (i < sizeof<Shape>()) {
        buffer[i] = src[i];
        i = i + 1;
    }

    # Check sentinel bytes after the enum - they should still be 0xAA
    local sentinel_start: u64 = sizeof<Shape>();
    local all_ok: bool = true;

    i = 0;
    loop (i < 16) {
        local byte: u8 = buffer[sentinel_start + i];
        if (byte != 170) {
            printf("ERROR in %s: Sentinel byte at offset %d is %d, expected 170 (buffer overflow)\n", testName, cast<int>(sentinel_start + i), cast<int>(byte));
            all_ok = false;
        }
        i = i + 1;
    }

    return all_ok;
}

frame main() {
    local passed: int = 0;
    local failed: int = 0;

    # Test Circle (single int)
    local circle: Shape = Shape.Circle(42);
    if (testEnum(circle, "Circle")) {
        passed = passed + 1;
    } else {
        failed = failed + 1;
    }

    # Test Rectangle (Point struct)
    local p: Point = Point { x: 100, y: 200 };
    local rect: Shape = Shape.Rectangle(p);
    if (testEnum(rect, "Rectangle")) {
        passed = passed + 1;
    } else {
        failed = failed + 1;
    }

    # Test Triangle (3 Point structs)
    local p1: Point = Point { x: 100, y: 200 };
    local p2: Point = Point { x: 300, y: 400 };
    local p3: Point = Point { x: 500, y: 600 };
    local tri: Shape = Shape.Triangle(p1, p2, p3);
    if (testEnum(tri, "Triangle")) {
        passed = passed + 1;
    } else {
        failed = failed + 1;
    }

    # Test Box (Large struct with 5 ints)
    local large: Large = Large { a: 1, b: 2, c: 3, d: 4, e: 5 };
    local box: Shape = Shape.Box(large);
    if (testEnum(box, "Box")) {
        passed = passed + 1;
    } else {
        failed = failed + 1;
    }

    # Test Complex (Mixed struct + Point + int)
    local mixed: Mixed = Mixed { flag: true, value: 999, data: 255 };
    local p4: Point = Point { x: 777, y: 888 };
    local complex: Shape = Shape.Complex(mixed, p4, 123);
    if (testEnum(complex, "Complex")) {
        passed = passed + 1;
    } else {
        failed = failed + 1;
    }

    printf("Tests passed: %d, failed: %d\n", passed, failed);

    if (failed == 0) {
        printf("SUCCESS: All buffer overflow tests passed\n");
    } else {
        printf("FAIL: %d tests detected buffer overflow\n", failed);
    }
}
