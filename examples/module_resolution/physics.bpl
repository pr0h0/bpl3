# physics.bpl - Physics calculations
# Depends on: geometry.bpl, math_utils.bpl
import [Point], distanceSquared from "./geometry.bpl";
import add, multiply from "./math_utils.bpl";
export [Velocity];
export [Body];
export updatePosition;
export kineticEnergy;
struct Velocity {
    vx: int,
    vy: int,
}
struct Body {
    position: Point,
    velocity: Velocity,
    mass: int,
}
frame updatePosition(b: Body, dt: int) ret Point {
    local newX: int = add(b.position.x, multiply(b.velocity.vx, dt));
    local newY: int = add(b.position.y, multiply(b.velocity.vy, dt));
    return Point { x: newX, y: newY };
}
frame kineticEnergy(b: Body) ret int {
    # KE = 1/2 * m * v^2 (simplified without the 1/2)
    local vSquared: int = add(multiply(b.velocity.vx, b.velocity.vx), multiply(b.velocity.vy, b.velocity.vy));
    return multiply(b.mass, vSquared);
}
