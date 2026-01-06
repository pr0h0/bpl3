extern printf(f: string, ...);
extern sprintf(f: string, ...) ret string;
extern sqrt(val: float) ret float;

import [Array] from "std/array.bpl";

struct Point {
    x: int,
    y: int,
    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }

    frame distance(this: *Point) ret float {
        return sqrt(cast<float>((this.x * this.x) + (this.y * this.y)));
    }

    frame translate(this: *Point, dx: int, dy: int) {
        this.x = this.x + dx;
        this.y = this.y + dy;
    }
}

frame calculate(width: int, height: int) ret int {
    return width * height;
}

frame testInlayHints() {
    # Type hints: should show `: int` after x
    local x: int = 42;

    # Type hints: should show `: string` after name
    local name: string = "test";

    # Type hints: should show `: bool` after flag
    local flag: bool = true;

    # Parameter hints: should show width: and height: before args
    local area: int = calculate(10, 20);

    # Parameter hints for struct method
    local p: Point = Point.new(5, 10);
    p.translate(3, 4);

    # Type hint for struct literal
    local p2: Point = Point.new(1, 2);
    # Array type hint
    local arr: Array<int> = Array<int>.new(10);

    # Parameter hints should skip 'this'
    local dist: float = p.distance();
}

frame testSignatureHelp() {
    # When cursor is inside these calls, signature help should appear
    printf("Hello %d", 42);
    sprintf("%s %d", "test", 123);

    local p: Point = Point.new(0, 0);
    p.translate(5, 10);

    local result: int = calculate(100, 200);
}
