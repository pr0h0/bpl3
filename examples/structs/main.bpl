import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }

    frame print(this: Point) {
        printf("Point(x=%d, y=%d)\n", this.x, this.y);
    }

    frame move(this: *Point, dx: int, dy: int) {
        this.x = this.x + dx;
        this.y = this.y + dy;
    }

    frame isEqual(this: Point, other: Point) ret bool {
        return (this.x == other.x) && (this.y == other.y);
    }
}

struct Rect {
    top_left: Point,
    bottom_right: Point,
    frame new(x1: int, y1: int, x2: int, y2: int) ret Rect {
        local r: Rect;
        r.top_left = Point.new(x1, y1);
        r.bottom_right = Point.new(x2, y2);
        return r;
    }

    frame area(this: Rect) ret int {
        local width: int = this.bottom_right.x - this.top_left.x;
        local height: int = this.bottom_right.y - this.top_left.y;
        return width * height;
    }

    frame contains(this: Rect, p: Point) ret bool {
        return (p.x >= this.top_left.x) && (p.x <= this.bottom_right.x) && (p.y >= this.top_left.y) && (p.y <= this.bottom_right.y);
    }
}

frame main() ret int {
    printf("--- Struct Test ---\n");

    # Basic Struct Creation and Method Call
    local p1: Point = Point.new(10, 20);
    printf("Created p1: ");
    p1.print();

    # Mutability
    p1.move(5, -5);
    printf("Moved p1 (5, -5): ");
    p1.print();

    # Struct Equality
    local p2: Point = Point.new(15, 15);
    printf("Created p2: ");
    p2.print();

    if (p1.isEqual(p2)) {
        printf("p1 is equal to p2\n");
    } else {
        printf("p1 is NOT equal to p2\n");
    }

    # Nested Structs
    local r: Rect = Rect.new(0, 0, 100, 50);
    printf("Created Rect from (0,0) to (100,50)\n");
    printf("Rect Area: %d\n", r.area());

    # Point containment
    local p3: Point = Point.new(50, 25);
    printf("Created p3: ");
    p3.print();

    if (r.contains(p3)) {
        printf("Rect contains p3\n");
    } else {
        printf("Rect does NOT contain p3\n");
    }

    local p4: Point = Point.new(150, 150);
    printf("Created p4: ");
    p4.print();

    if (r.contains(p4)) {
        printf("Rect contains p4\n");
    } else {
        printf("Rect does NOT contain p4\n");
    }

    return 0;
}
