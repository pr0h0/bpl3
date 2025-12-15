import [Vec2] from "std/vec2.bpl";
import [Vec3] from "std/vec3.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Vec Demo ===");
    local a: Vec2 = Vec2.new(3.0, 4.0);
    local len2: float = a.length();
    IO.printInt(cast<int>(len2));
    local b: Vec3 = Vec3.new(1.0, 2.0, 3.0);
    local c: Vec3 = Vec3.new(3.0, 2.0, 1.0);
    local d: Vec3 = b.cross(c);
    d.print();
    return 0;
}
