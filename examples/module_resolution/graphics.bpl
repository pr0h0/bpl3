# graphics.bpl - Graphics and rendering utilities
# Depends on: geometry.bpl
import [Point], [Circle] from "./geometry.bpl";
export drawCircle;
extern printf(fmt: string, ...) ret int;
frame printPoint(p: Point) {
    printf("Point(%d, %d)\n", p.x, p.y);
}
frame printCircle(c: Circle) {
    printf("Circle at ");
    printPoint(c.center);
    printf("  radius: %d\n", c.radius);
}
frame drawCircle(c: Circle) {
    printf("Drawing circle...\n");
    printCircle(c);
}
