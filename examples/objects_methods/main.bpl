extern printf(fmt: string, ...);
# Example showcasing struct methods, constructors, and instance methods
struct Rectangle {
    width: int,
    height: int,
    frame new(width: int, height: int) ret Rectangle {
        local r: Rectangle;
        r.width = width;
        r.height = height;
        return r;
    }
    frame area(this: Rectangle) ret int {
        return this.width * this.height;
    }
    frame perimeter(this: Rectangle) ret int {
        return (2 * this.width) + this.height;
    }
    frame is_square(this: Rectangle) ret bool {
        return this.width == this.height;
    }
    frame scale(this: Rectangle, factor: int) ret Rectangle {
        return Rectangle.new(this.width * factor, this.height * factor);
    }
    frame print_info(this: Rectangle) {
        printf("Rectangle: %d x %d\n", this.width, this.height);
        printf("  Area: %d\n", this.area());
        printf("  Perimeter: %d\n", this.perimeter());
        if (this.is_square()) {
            printf("  This is a square!\n");
        }
    }
}
struct Circle {
    radius: float,
    frame new(radius: float) ret Circle {
        local c: Circle;
        c.radius = radius;
        return c;
    }
    frame area(this: Circle) ret float {
        # Using approximation: π ≈ 3.14159
        return 3.14159 * this.radius * this.radius;
    }
    frame circumference(this: Circle) ret float {
        return 2.0 * 3.14159 * this.radius;
    }
    frame print_info(this: Circle) {
        printf("Circle: radius = %.2f\n", this.radius);
        printf("  Area: %.2f\n", this.area());
        printf("  Circumference: %.2f\n", this.circumference());
    }
}
frame main() ret int {
    local rect1: Rectangle = Rectangle.new(10, 5);
    local rect2: Rectangle = Rectangle.new(7, 7);
    local circle: Circle = Circle.new(5.0);
    printf("=== Rectangle 1 ===\n");
    rect1.print_info();
    printf("\n=== Rectangle 2 ===\n");
    rect2.print_info();
    local scaled: Rectangle = rect1.scale(2);
    printf("\n=== Scaled Rectangle (2x) ===\n");
    scaled.print_info();
    printf("\n=== Circle ===\n");
    circle.print_info();
    return 0;
}
