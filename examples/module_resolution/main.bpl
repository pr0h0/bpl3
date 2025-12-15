# main.bpl - Main application entry point
# Depends on: graphics.bpl, physics.bpl, geometry.bpl
import [Point], [Circle], circleArea from "./geometry.bpl";
import drawCircle from "./graphics.bpl";
import [Body], [Velocity], kineticEnergy from "./physics.bpl";
extern printf(fmt: string, ...) ret int;
frame main() ret int {
    printf("=== Module Resolution Demo ===\n\n");
    # Test geometry module
    printf("1. Geometry Module:\n");
    local center: Point = Point { x: 10, y: 20 };
    local c: Circle = Circle { center: center, radius: 5 };
    local area: int = circleArea(c);
    printf("Circle area (r=%d): %d\n\n", c.radius, area);
    # Test graphics module
    printf("2. Graphics Module:\n");
    drawCircle(c);
    printf("\n");
    # Test physics module
    printf("3. Physics Module:\n");
    local vel: Velocity = Velocity { vx: 3, vy: 4 };
    local body: Body = Body { position: Point { x: 0, y: 0 }, velocity: vel, mass: 10 };
    local ke: int = kineticEnergy(body);
    printf("Body kinetic energy: %d\n", ke);
    printf("Body position: (%d, %d)\n\n", body.position.x, body.position.y);
    printf("=== All modules loaded successfully! ===\n");
    return 0;
}
