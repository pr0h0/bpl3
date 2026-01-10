# Shapes library for showcase

extern sqrt(x: float) ret float;
extern printf(fmt: string, ...);

struct Point {
    x: float,
    y: float,

    frame distance(this: *Point, other: *Point) ret float {
        local dx: float = this.x - other.x;
        local dy: float = this.y - other.y;
        return sqrt((dx * dx) + (dy * dy));
    }
}

spec Drawable {
    frame draw(this: *Self);
}

struct Circle: Drawable {
    center: Point,
    radius: float,

    frame area(this: *Circle) ret float {
        return 3.14159 * this.radius * this.radius;
    }

    frame draw(this: *Circle) {
        printf("Drawing Circle at (%.2f, %.2f) with radius %.2f\n", this.center.x, this.center.y, this.radius);
    }
}

struct Rectangle: Drawable {
    top_left: Point,
    width: float,
    height: float,

    frame area(this: *Rectangle) ret float {
        return this.width * this.height;
    }

    frame draw(this: *Rectangle) {
        printf("Drawing Rectangle at (%.2f, %.2f) size %.2fx%.2f\n", this.top_left.x, this.top_left.y, this.width, this.height);
    }
}

export [Point];
export [Drawable];
export [Circle];
export [Rectangle];
